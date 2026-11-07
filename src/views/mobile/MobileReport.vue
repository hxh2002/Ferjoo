<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { useAuth } from '../../composables/useAuth.js';
import { guestLoginTarget, guestRegisterTarget, isGuest } from '../../lib/mobile-guest.js';
import MGuestNotice from '../../components/mobile/MGuestNotice.vue';
import { getCareRecord, listStarters, saveObservation } from '../../services/care.service.js';
import { loadSessionReport, storeSessionReport, snapshot, reportText, fieldLabels, describeField, describeSource } from '../../services/mobile-diagnosis.service.js';

const route = useRoute();
const auth = useAuth();
const { user } = auth;
const accountId = computed(() => user.value?.id || 'guest');
const router = useRouter();
// 游客态：不读取云端记录（避免无权查询报错），也不回显上一个账号残留的结果。
const guest = computed(() => isGuest(auth));
const { replace: replaceDraft } = useCheckinDraft(accountId);
const { replace: replaceDiagnosis } = useCheckinDraft(accountId, { kind: 'diagnosis' });
const risk = computed(() => report.value?.result?.status === 'discard' || [report.value?.input?.color, report.value?.input?.smell].includes('suspicious'));
const insufficient = computed(() => !risk.value && ['needs-check', 'incomplete'].includes(report.value?.result?.status));
function regenerate() {
  const feeding = report.value?.input?.feedingId;
  if (feeding) {
    replaceDraft({ ...snapshot(report.value.input), starterId: report.value.starterId || '', step: 1 });
    router.push({ path: '/checkin', query: { feeding, starter: report.value.starterId || undefined, mode: 'diagnosis' } });
    return;
  }
  router.push('/doctor/rounds');
}
function finish() {
  router.push('/diary');
}
function backToReview() {
  if (!report.value) return;
  const feeding = report.value.input?.feedingId;
  replaceDiagnosis({ ...snapshot(report.value.input), starterId: report.value.starterId || '', step: 3 });
  router.push({
    path: '/checkin',
    query: {
      ...(feeding ? { feeding } : {}),
      edit: 'session',
      ...(report.value.starterId ? { starter: report.value.starterId } : {}),
      mode: 'diagnosis'
    }
  });
}
const report = ref(null);
const starterName = ref('名称不可用');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const copyStatus = ref('');
const readable = ref(false);
const cloud = computed(() => !!route.params.id && route.params.id !== 'session');
const text = computed(() => report.value && report.value.kind !== 'feeding' ? [`酵种：${report.value.starterId ? starterName.value : '未选择'}`, reportText({ ...report.value, occurredAt: formatDate(report.value.occurredAt) })].join('\n') : '');
let generation = 0;
let disposed = false;
function formatDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '时间不可用';
}
function normalizeRecord(value, id) {
  return { ...value, occurredAt: value.occurredAt || value.occurred_at, savedId: value.id || id, starterId: value.starterId || value.starter_id };
}
async function loadStarterName(id, token, owner) {
  if (!id || owner === 'guest') return;
  try {
    const list = await listStarters({ userId: owner });
    if (!disposed && token === generation && owner === accountId.value) starterName.value = list.find((item) => item.id === id)?.name || '名称不可用';
  } catch { /* Record facts remain readable when names cannot be loaded. */ }
}
watch([accountId, () => route.params.id, () => route.path], async () => {
  const token = ++generation;
  const owner = accountId.value;
  const id = route.params.id;
  report.value = null;
  starterName.value = '名称不可用';
  loading.value = false;
  saving.value = false;
  error.value = '';
  copyStatus.value = '';
  readable.value = false;
  if (!cloud.value) { report.value = loadSessionReport(owner); loadStarterName(report.value?.starterId, token, owner); return; }
  if (!user.value) { error.value = '请登录后查看云端记录。'; return; }
  loading.value = true;
  try {
    const record = await getCareRecord(id, { userId: owner });
    if (disposed || token !== generation || owner !== accountId.value) return;
    if (!record) throw new Error('未找到记录，或你没有访问权限。');
    const value = normalizeRecord(snapshot(record), id);
    if (value.kind === 'feeding') {
      report.value = value;
    } else {
      const input = value.input || value.payload?.input;
      const result = value.result || value.payload?.result;
      if (value.kind !== 'observation' || !input || !result) throw new Error('这不是一条包含建议快照的观察记录。');
      report.value = { ...value, input, result };
    }
    loadStarterName(value.starterId, token, owner);
  } catch (cause) { if (!disposed && token === generation) error.value = cause?.message || '加载失败，请稍后重试。'; }
  finally { if (!disposed && token === generation) loading.value = false; }
}, { immediate: true, flush: 'sync' });
async function save() {
  if (!report.value || cloud.value || saving.value || report.value.savedId) return;
  if (!user.value || !report.value.starterId) { error.value = '云端保存需要登录并选择酵种；当前结果仍可阅读。'; return; }
  const token = generation;
  const owner = accountId.value;
  const original = report.value;
  saving.value = true;
  error.value = '';
  try {
    const saved = await saveObservation({ requestId: original.requestId, starterId: original.starterId, occurredAt: original.occurredAt, input: { ...snapshot(original.input), algorithmVersion: original.algorithmVersion, schemaVersion: original.schemaVersion }, result: snapshot(original.result) });
    if (disposed || token !== generation || report.value !== original) return;
    if (!saved?.id) throw new Error('未收到云端保存确认，请重试（沿用同一请求标识）。');
    const updated = { ...snapshot(original), savedId: saved.id };
    storeSessionReport(owner, updated);
    report.value = updated;
  } catch (cause) { if (!disposed && token === generation) error.value = cause?.message || '尚未保存，检查网络后重试。'; }
  finally { if (!disposed && token === generation) saving.value = false; }
}
async function copy() {
  const token = generation;
  try {
    await navigator.clipboard.writeText(text.value);
    if (!disposed && token === generation) copyStatus.value = '已复制建议文本。';
  } catch {
    if (disposed || token !== generation) return;
    readable.value = true;
    copyStatus.value = '无法自动复制。下方已展开可选择文本，请长按选择复制。';
  }
}
onUnmounted(() => { disposed = true; generation++; });
</script>

<template>
  <main class="m-page mobile-report">
    <header v-if="!report || cloud || report.kind === 'feeding'"><h1>{{ report?.kind === 'feeding' ? '喂养记录（只读）' : cloud ? '观察记录（只读）' : '本次建议' }}</h1></header>
    <div v-if="loading" class="m-skeleton" role="status" aria-label="正在加载云端记录"><span></span><span></span></div><p v-if="error && !guest" class="m-error" role="alert">{{ error }}</p>
    <!-- 游客打开云端观察记录：不请求云端、不显示他人数据，只给登录引导并保留当前记录地址回跳。 -->
    <MGuestNotice
      v-if="cloud && guest && !loading"
      title="登录后查看这条观察记录"
      description="云端记录按账号隔离，登录后会回到当前这条记录。"
      :login-to="guestLoginTarget(route)"
      :register-to="guestRegisterTarget(route)"
      register
    />
    <section v-else-if="!loading && !report" class="m-card"><h2>当前没有可读取的结果</h2><p>{{ cloud ? '记录不存在、读取失败，或当前账号没有访问权限。' : '本机会话已结束或已切换账号。' }}</p><RouterLink to="/checkin">继续或重新记录观察</RouterLink></section>
    <template v-if="report && report.kind === 'feeding'">
      <section class="m-card"><p role="status">已云端保存的事实记录</p><p class="m-muted">喂养时刻：{{ formatDate(report.occurredAt) }}<br>酵种：{{ starterName }}</p><h2>喂养比例（老种 : 水 : 面粉）</h2><p>{{ report.ratio === 'deep_reset' ? '大比例刷新' : report.ratio || '未记录' }}</p><h2>起始高度</h2><p>{{ report.input?.baseline_height_mm == null ? '未记录' : `${report.input.baseline_height_mm} mm` }}<span v-if="report.input?.baseline_height_mm != null">（{{ report.input.baseline_source === 'device' ? '设备读取' : report.input.baseline_source === 'manual' ? '手工记录' : '来源未记录' }}）</span></p><RouterLink class="m-secondary" :to="{ path: '/checkin', query: { starter: report.starterId, feeding: report.savedId } }">基于这次喂养记录观察</RouterLink></section>
      <details class="m-card"><summary>技术详情</summary><p>记录编号：{{ report.savedId }}<br>酵种编号：{{ report.starterId || '未记录' }}</p></details>
    </template>
    <template v-else-if="report">
      <template v-if="risk && !cloud">
        <h1 class="branch-title">需要先关注安全观察</h1>
        <section class="branch-card">
          <h2>{{ report.result.title || '请核对颜色与气味' }}</h2>
          <p>{{ report.result.subtitle || '具体提示与后续操作由安全规则返回。' }}</p>
          <ul v-if="report.result.actions?.length"><li v-for="action in report.result.actions" :key="action">{{ action }}</li></ul>
        </section>
      </template>
      <section v-else-if="risk" class="m-card m-risk"><p role="status">食品安全优先</p><h2>请停止使用并丢弃这份酵种</h2><p>不要品尝；清洁接触过的容器与工具。这不是一条普通养护建议。</p></section>
      <template v-else-if="insufficient">
        <h1 class="insufficient-title">暂时无法生成建议</h1>
        <section class="missing-card">
          <h2>请补充必要信息</h2>
          <ul v-if="report.result.reasons?.length"><li v-for="reason in report.result.reasons" :key="reason">{{ reason }}</li></ul>
          <p v-else>缺少的项目由系统具体提示。</p>
          <ul v-if="report.result.actions?.length"><li v-for="action in report.result.actions" :key="action">{{ action }}</li></ul>
          <button v-if="!cloud" type="button" class="save-link" :disabled="saving || !!report.savedId || !user || !report.starterId" @click="save">{{ saving ? '保存中…' : report.savedId ? '已保存到日记' : '保存到日记' }}</button>
        </section>
      </template>
      <template v-else-if="!cloud">
        <h1 class="result-title">诊断结果</h1>
        <p class="result-caption">结果内容由算法返回</p>
        <section class="result-card">
          <p class="result-status" role="status">{{ report.savedId ? '已保存到日记' : '已生成，尚未保存到日记' }}</p>
          <h2>{{ report.result.title }}</h2>
          <p>{{ report.result.subtitle }}</p>
          <button type="button" class="save-link" :disabled="saving || !!report.savedId || !user || !report.starterId" @click="save">{{ saving ? '保存中…' : report.savedId ? '已保存到日记' : '保存到日记' }}</button>
          <button type="button" class="save-link" @click="regenerate">重新观察</button>
        </section>
      </template>
      <section v-else class="m-card"><p role="status">{{ report.savedId ? '已保存到日记' : '已生成，尚未保存到日记' }}</p><p class="m-muted">观察时刻：{{ formatDate(report.occurredAt) }}<br>酵种：{{ report.starterId ? starterName : '未选择，仅生成建议' }}</p><p class="m-muted" role="status">{{ report.result.badge }}</p><h2>{{ report.result.title }}</h2><p>{{ report.result.subtitle }}</p></section>
      <section v-if="!risk && !insufficient" class="m-card"><h2>下一步</h2><ul><li v-for="action in report.result.actions" :key="action">{{ action }}</li></ul><h3>为什么</h3><ul><li v-for="reason in report.result.reasons" :key="reason">{{ reason }}</li></ul></section>
      <section v-if="!risk && !insufficient && (report.result.timing || report.result.timingNote || report.result.ph)" class="m-card"><h2>辅助信息</h2><p v-if="report.result.timing">{{ report.result.timing.display }}</p><p class="m-muted">{{ report.result.timingNote }}</p><p v-if="report.result.ph">{{ report.result.ph.label }}<br>{{ report.result.ph.message }}</p></section>
      <section v-if="risk && cloud" class="m-card"><h2>请立即处理</h2><ul><li v-for="action in report.result.actions" :key="action">{{ action }}</li></ul></section>
      <section v-if="report.result.safety?.length" class="m-card"><h2>安全提醒</h2><ul><li v-for="item in report.result.safety" :key="item">{{ item }}</li></ul></section>
      <details class="m-card"><summary>依据与来源</summary><template v-for="group in [{ public: true, title: '公开来源' }, { public: false, title: '项目经验先验（未经同行评审）' }]" :key="group.title"><h3>{{ group.title }}</h3><ul><li v-for="item in (report.result.citations || []).filter((item) => item.public === group.public)" :key="item.key"><a v-if="item.url && group.public" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title || item.citation }}</a><span v-else>{{ item.citation || item.key }}</span><p>{{ item.displayNote || item.supports }}</p></li></ul></template><p>经验先验样本有限。</p></details>
      <details class="m-card"><summary>本次输入快照与来源</summary><p class="m-muted">{{ report.source || '已保存的观察快照' }}</p><dl><template v-for="(label, key) in fieldLabels" :key="key"><dt>{{ label }}</dt><dd>{{ describeField(key, report.input[key]) }}<small class="m-muted"> · 来源：{{ describeSource(report.input, key) }}</small></dd></template></dl><p v-if="report.input.quickText">一句话原文：{{ report.input.quickText }}</p></details>
      <details class="m-card"><summary>技术详情</summary><p>记录编号：{{ report.savedId || '尚未云端保存' }}<br>酵种编号：{{ report.starterId || '未选择' }}<br>算法版本：{{ report.algorithmVersion || report.input?.algorithmVersion || '历史快照（版本未记录）' }}</p></details>
      <button v-if="cloud" type="button" class="m-secondary" @click="regenerate">基于这次输入重新生成（创建新记录）</button>
      <p v-if="!cloud && !report.starterId" class="m-muted">未选择酵种，不能云端保存。<RouterLink to="/device">去今天选择</RouterLink>后再重新生成。</p>
      <p v-if="!cloud && !user" class="m-muted">登录后才能云端保存。<RouterLink :to="guestLoginTarget(route)">前往登录</RouterLink></p>
      <button type="button" class="m-secondary" @click="copy">复制建议</button><p role="status">{{ copyStatus }}</p>
      <label v-if="readable" class="m-field">可选择的建议文本<textarea :value="text" readonly rows="12" /></label>
      <div v-if="insufficient || (risk && !cloud)" class="m-actions"><button type="button" class="m-primary review-return" @click="backToReview">返回核对</button></div>
      <div v-else-if="!cloud" class="m-actions"><button type="button" class="m-primary review-return" @click="finish">完成</button></div>
    </template>
  </main>
</template>

<style scoped>
/* 370:17531 / 17543 / 17554：顶栏底 91 → 正常分支标题 112（+21）、安全 / 信息不足标题 143（+52）。
   页面留白收成 21 并关掉 flex gap。全局 `.m-page > *{margin-block:0}` 会吃掉普通 margin，
   所以这里用带 vue 作用域属性的全前缀选择器统一表达间距，保持其余模块仍是 16px。 */
.mobile-area .m-page.mobile-report{padding-top:calc(21px + env(safe-area-inset-top));gap:0}
.mobile-area .m-page.mobile-report > * + *{margin-top:var(--m-module-gap)}
.mobile-area .m-page.mobile-report > h1.result-title{margin-top:0}
.mobile-area .m-page.mobile-report > .result-caption{margin-top:6px}
.mobile-area .m-page.mobile-report > .result-card{margin-top:33px}
.mobile-area .m-page.mobile-report > h1.branch-title{margin-top:31px}
.mobile-area .m-page.mobile-report > .branch-card{margin-top:33px}
.mobile-area .m-page.mobile-report > h1.insufficient-title{margin-top:31px}
.mobile-area .m-page.mobile-report > .missing-card{margin-top:33px}
.mobile-report{padding-bottom:calc(11rem + env(safe-area-inset-bottom));overflow-wrap:anywhere}.mobile-report > header h1{margin:0;font-size:var(--text-xl);line-height:36px;font-weight:500}.m-card{margin:1rem 0;padding:1rem;background:var(--surface-card);border:1px solid var(--border-default)}.m-actions{position:fixed;bottom:env(safe-area-inset-bottom);left:0;right:0;z-index:var(--m-z-raised);width:100%;max-width:var(--m-page-max,42rem);margin-inline:auto;display:flex;justify-content:center;gap:12px;padding:12px 24px;background:transparent;border-top:0}.m-primary,.m-secondary{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;flex:1;height:60px;min-height:60px;padding:0 16px;font:inherit;font-size:16px;font-weight:500;text-decoration:none;cursor:pointer}.m-primary{border-radius:var(--m-radius-button);background:var(--brand-light);border:0;color:var(--text-primary)}.m-secondary{border:1px solid var(--border-warm);border-radius:var(--m-radius-button);background:transparent;color:inherit}.mobile-report.m-page h1.insufficient-title{margin:31px 0 0;font-size:20px;font-weight:500;line-height:29px;letter-spacing:0}.missing-card{min-height:150px;margin:33px 0 0;padding:20px 18px;border:0;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:none}.mobile-report.m-page h1.result-title{margin:0;font-size:22px;font-weight:500;line-height:32px;letter-spacing:0}.result-caption{margin:6px 0 0;color:var(--text-secondary);font-size:13px;line-height:19px}.result-card{min-height:165px;margin:33px 0 0;padding:20px 18px;border:0;border-radius:var(--radius-card);background:var(--surface-card)}.result-card h2{margin:0;font-size:16px;font-weight:500;line-height:24px}.result-status,.result-card p{margin:12px 0 0;color:var(--text-secondary);font-size:14px;line-height:21px}.result-card h2 + p{margin-top:16px}.result-card .save-link{display:flex;width:max-content}.mobile-report.m-page h1.branch-title{margin:31px 0 0;font-size:20px;font-weight:500;line-height:29px;letter-spacing:0}.branch-card{min-height:160px;margin:33px 0 0;padding:20px 18px;border:0;border-radius:var(--radius-card);background:var(--m-chart-pale);color:var(--text-primary)}.branch-card h2{margin:0;font-size:16px;font-weight:500;line-height:24px}.branch-card p,.branch-card li{margin:18px 0 0;color:var(--text-secondary);font-size:13px;line-height:19px}.missing-card h2{margin:0;font-size:16px;font-weight:500;line-height:24px}.missing-card p,.missing-card li{margin:16px 0 0;color:var(--text-secondary);font-size:13px;line-height:19px}.review-return{height:56px;min-height:56px;border-radius:28px}.save-link{display:inline-flex;align-items:center;min-height:44px;margin-top:8px;padding:0;border:0;background:transparent;color:var(--brand-action);font:inherit;font-size:14px;font-weight:500;cursor:pointer}button:disabled{opacity:.55;cursor:default}.m-error{color:var(--danger-text)}.m-muted{color:var(--text-secondary);font-size:.92rem}li{margin:.65rem 0}.m-field{display:grid;gap:.5rem;margin:1rem 0}textarea{width:100%;box-sizing:border-box;font:inherit;padding:.75rem}dt{font-weight:600;margin-top:.75rem}dd{margin:0;white-space:pre-wrap}summary{min-height:44px;cursor:pointer}.m-risk{color:var(--danger-text);background:var(--danger-bg);border-color:var(--danger-text)}
</style>
