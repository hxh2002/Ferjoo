<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { getCareRecord, listStarters } from '../../services/care.service.js';
import { loadFeedingEvidence } from '../../services/feeding-analysis.service.js';
import { describeField } from '../../services/mobile-diagnosis.service.js';
import { CLOSE_REASON_LABELS, feedingEvidenceCacheKey, roundState } from '../../lib/mobile-records.js';
import { READ_TTL, cachedRead } from '../../lib/read-cache.js';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const record = ref(null);
const evidence = ref(null);
const evidenceError = ref('');
const name = ref('名称不可用');
const error = ref('');
const loading = ref(false);
const summary = computed(() => evidence.value?.summary || null);
const state = computed(() => summary.value ? roundState(summary.value) : null);
const returnTo = computed(() => {
  const value = route.query.returnTo;
  if (typeof value !== 'string' || /[\\\u0000-\u0020\u007f]/.test(value)) return '/records';
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname === '/records' ? `${url.pathname}${url.search}${url.hash}` : '/records';
  } catch { return '/records'; }
});
const when = computed(() => record.value ? new Date(record.value.occurred_at).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const baseline = computed(() => summary.value?.baselineHeightMm ?? record.value?.input?.baseline_height_mm ?? record.value?.feed_event?.baseline_height_mm ?? null);
const baselineSource = computed(() => summary.value?.baselineSource ?? record.value?.input?.baseline_source ?? record.value?.feed_event?.baseline_source);
const baselineSourceText = computed(() => ({ manual: '手工记录', 'sensor-mean': '设备自动', 'sensor-min': '设备自动', device: '设备读取' }[baselineSource.value] || '来源未记录'));
const currentHeight = computed(() => Number.isFinite(summary.value?.currentHeightMm) ? summary.value.currentHeightMm : null);
const expansionText = computed(() => Number.isFinite(summary.value?.expansionPercent) ? `${summary.value.expansionPercent.toFixed(1)}%` : '—');
const endReasonText = computed(() => {
  const value = summary.value;
  if (value?.windowStatus !== 'closed') return '';
  if (value.windowEndReason === 'next_feeding') return '下一次喂养';
  return CLOSE_REASON_LABELS[evidence.value?.closure?.detail] || '手动结束';
});
const weights = computed(() => {
  const input = record.value?.input || {};
  const parts = [['老种', input.starter_g], ['水', input.water_g], ['面粉', input.flour_g], ['合计', input.total_g]];
  const items = parts.filter(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0).map(([label, value]) => `${label} ${Number(value)} g`);
  return items.length ? items.join(' · ') : '';
});
function pad(value) { return String(value).padStart(2, '0'); }
function clockText(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '--';
}
// 跨天窗口用偏移小标提示，时间本身只保留时分。
const windowRange = computed(() => {
  const value = summary.value;
  const from = Date.parse(value?.windowFrom || record.value?.occurred_at);
  if (!Number.isFinite(from)) return null;
  const closed = !!value?.windowClosed;
  const to = closed ? Date.parse(value?.windowClosedAt || value?.windowTo)
    : value?.windowStatus === 'in_progress' ? Date.now() : NaN;
  const fromDate = new Date(from);
  const toDate = new Date(Number.isFinite(to) ? to : from);
  const offset = Number.isFinite(to) ? Math.round((new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()) - new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())) / 86400000) : 0;
  return {
    from: clockText(from),
    to: !Number.isFinite(to) ? '—' : closed ? clockText(to) : '现在',
    offset: offset ? `${offset > 0 ? '+' : '−'}${Math.abs(offset)}` : '',
    title: Number.isFinite(to) ? `${fromDate.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${toDate.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''
  };
});
const durationText = computed(() => {
  const hours = summary.value?.elapsedHours;
  if (!Number.isFinite(hours) || hours < 0) return '—';
  const minutes = Math.round(hours * 60);
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
});
const temperatureText = computed(() => Number.isFinite(summary.value?.tempC) ? `${summary.value.tempC.toFixed(1)} °C` : '');
const evidenceText = computed(() => {
  const value = summary.value;
  if (!value) return '';
  return [
    value.measurementCount ? `${value.measurementCount} 条采样` : '',
    value.temperatureCoverageReliable ? '温度覆盖完整' : ''
  ].filter(Boolean).join(' · ');
});
// 窗口状态、设备观测质量和喂养事实分开说明，缺失设备数据不等于发酵结束。
const hint = computed(() => {
  if (evidenceError.value) return evidenceError.value;
  const value = summary.value;
  if (!evidence.value) return '';
  if (evidence.value.unavailableReason) return evidence.value.unavailableReason;
  if (!value) return '';
  if (value.baselineStatus === 'pending') return '基线计算中…';
  if (value.baselineStatus === 'insufficient') return '基线采样不足，暂无法计算膨胀率。';
  if (value.heightStale) return '设备数据已中断，膨胀率沿用上次读数。';
  if (value.baselineIncomplete) return '基线采样未满，膨胀率仅供参考。';
  if (!value.measurementCount) return '本轮没有可用的设备采样，仅保留喂养事实。';
  return '';
});
let generation = 0;
watch([() => user.value?.id, () => route.params.id], async ([userId, id]) => {
  const token = ++generation;
  record.value = null; evidence.value = null; evidenceError.value = '';
  name.value = '名称不可用'; error.value = ''; loading.value = false;
  if (!userId) { error.value = '请登录后查看云端记录。'; return; }
  loading.value = true;
  try {
    const value = await getCareRecord(id, { userId });
    if (token !== generation) return;
    if (value?.kind === 'observation') {
      await router.replace({ path: `/reports/${value.id}`, query: { returnTo: returnTo.value } });
      return;
    }
    if (value?.kind !== 'feeding') throw new Error('记录类型不支持，请返回记录列表查看。');
    record.value = value;
    // 轮次详情与记录页共用同一份证据，避免列表和详情对状态给出不同结论。
    const [starters, proof] = await Promise.all([
      listStarters({ userId }).catch(() => []),
      // 证据包含整轮采样，短时间内重复进入直接复用；任何写入都会推进修订号使旧结果失效。
      cachedRead(
        feedingEvidenceCacheKey(userId, value.starter_id, value.id),
        () => loadFeedingEvidence(userId, value.starter_id, value.id),
        { ttl: READ_TTL.records }
      ).catch((cause) => ({ error: cause }))
    ]);
    if (token !== generation) return;
    name.value = starters.find((item) => item.id === value.starter_id)?.name || '名称不可用';
    if (proof?.error) evidenceError.value = proof.error?.message || '设备证据读取失败，本轮仅保留喂养事实。';
    else evidence.value = proof;
  } catch (cause) { if (token === generation) error.value = cause.message || '记录加载失败。'; }
  finally { if (token === generation) loading.value = false; }
}, { immediate: true });
onScopeDispose(() => { generation++; });
</script>

<template>
  <main class="m-page mobile-record-detail">
    <header><h1>发酵轮次</h1><p class="m-muted">{{ name }}<template v-if="when"> · {{ when }}</template></p></header>
    <p v-if="loading" role="status">正在加载…</p><p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <section v-if="record" class="m-card window-card">
      <div class="window-head">
        <div><strong>{{ describeField('ratio', record.ratio) }}</strong><small>喂养比例（老种 : 水 : 面粉）</small></div>
        <span v-if="state" class="window-state" :data-tone="state.tone">{{ state.label }}</span>
      </div>
      <div class="window-grid">
        <div><span>开始</span><strong>{{ windowRange?.from || '--' }}</strong></div>
        <div>
          <span>{{ summary?.windowClosed ? '结束' : '现在' }}</span>
          <strong>{{ windowRange?.to || '--' }}<span v-if="windowRange?.offset" class="day-offset">{{ windowRange.offset }}</span></strong>
        </div>
        <div><span>{{ summary?.windowClosed ? '历时' : '已发酵' }}</span><strong>{{ durationText }}</strong></div>
      </div>
      <p v-if="endReasonText" class="window-end">结束原因：{{ endReasonText }}</p>
      <div class="measure-grid">
        <div><span>起始高度</span><strong>{{ baseline == null ? '—' : `${Number(baseline).toFixed(1)} mm` }}</strong><small>{{ baselineSourceText }}</small></div>
        <div><span>{{ summary?.windowClosed ? '结束高度' : '当前高度' }}</span><strong>{{ currentHeight == null ? '—' : `${currentHeight.toFixed(1)} mm` }}</strong></div>
        <div><span>膨胀率</span><strong>{{ expansionText }}</strong></div>
      </div>
      <p v-if="temperatureText" class="window-meta">轮次均温 {{ temperatureText }}</p>
      <p v-if="hint" class="window-hint">{{ hint }}</p>
      <p v-if="evidenceText" class="window-meta">{{ evidenceText }}</p>
    </section>
    <section v-if="record" class="m-card">
      <template v-if="weights"><h2>投喂重量</h2><p>{{ weights }}</p></template>
      <RouterLink class="m-secondary" :to="{ path: '/checkin', query: { starter: record.starter_id, feeding: record.id, mode: 'diagnosis' } }">基于这次喂养记录做诊断</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.mobile-record-detail{overflow-wrap:anywhere}
.m-card{margin:1rem 0;padding:1rem;border:1px solid var(--border-default);background:var(--surface-card)}
.m-card h2{margin:0 0 .35rem;font-size:.9rem}
.m-card p{margin:.2rem 0 .6rem}
header h1{margin:0}
header p{margin:.25rem 0 0;font-size:.8rem}
.window-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem}
.window-head strong{display:block;font-size:1rem}
.window-head small{display:block;margin-top:.15rem;font-size:.7rem;color:var(--muted,#756d63)}
.window-state{padding:.15rem .5rem;border-radius:var(--radius-badge);background:#e8f0fa;color:#2B6CB0;font-size:.7rem;font-weight:600;white-space:nowrap}
.window-state[data-tone="closed"]{background:#e7f4ed;color:#2B7A55}
.window-state[data-tone="pending"]{background:#fdf3e2;color:#8a5a17}
.window-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin-top:.85rem}
.window-grid > div{display:grid;gap:.1rem;min-width:0}
.window-grid span{font-size:.68rem;color:var(--muted,#756d63)}
.window-grid strong{font-size:.95rem;font-variant-numeric:tabular-nums;white-space:nowrap}
.window-grid .day-offset{display:inline-grid;place-items:center;min-width:.85rem;height:.75rem;margin-left:.2rem;padding:0 .12rem;border-radius:var(--radius-badge);background:#f2dcd7;color:#a4524a;font-size:.52rem;line-height:1;font-weight:600}
.window-end{margin:.6rem 0 0;font-size:.75rem;color:var(--muted,#756d63)}
.measure-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin-top:.85rem;padding-top:.75rem;border-top:1px solid var(--border-subtle,#e7e0d7)}
.measure-grid > div{display:grid;gap:.1rem;min-width:0}
.measure-grid span{font-size:.68rem;color:var(--muted,#756d63)}
.measure-grid strong{font-size:1rem;font-variant-numeric:tabular-nums;white-space:nowrap}
.measure-grid small{font-size:.62rem;color:var(--muted,#756d63)}
.window-meta{margin:.6rem 0 0;font-size:.72rem;color:var(--muted,#756d63)}
.window-hint{margin:.6rem 0 0;padding:.5rem .6rem;border-radius:var(--radius-control);background:#fdf3e2;font-size:.72rem;line-height:1.5;color:#8a5a17}
.m-secondary{display:inline-flex;align-items:center;min-height:48px;padding:0 1rem;border:1px solid var(--border-input);color:inherit;text-decoration:none}
.m-error{color:var(--danger-text)}
</style>
