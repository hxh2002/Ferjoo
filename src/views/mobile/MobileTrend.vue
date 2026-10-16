<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import MobileMetricChart from '../../components/MobileMetricChart.vue';
import { METRICS, mobileDeviceService, mobileError, validateRange } from '../../services/mobile-device.service.js';
import { localDateTimeValue, parseLocalDateTime } from '../../lib/localDateTime.js';
import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { listCareRecords } from '../../services/care.service.js';
const baseline = ref(null);
const starterId = computed(() => typeof route.query.starter === 'string' ? route.query.starter : '');
const route = useRoute(); const auth = useAuth();
const metrics = Object.keys(METRICS); const metric = ref(route.query.metric && METRICS[route.query.metric] ? route.query.metric : 'height_mm');
const now = new Date(); const defaultTo = localDateTimeValue(now); const defaultFrom = localDateTimeValue(new Date(now.getTime() - 24 * 60 * 60 * 1000));
const from = ref(parseLocalDateTime(defaultFrom).toISOString()); const to = ref(parseLocalDateTime(defaultTo).toISOString()); const draftFrom = ref(localDateTimeValue(new Date(defaultFrom))); const draftTo = ref(localDateTimeValue(new Date(defaultTo))); const rows = ref([]); const device = ref(null); const loading = ref(false); const error = ref(''); const completeness = ref(''); const selectedIndex = ref(-1); const editingRange = ref(false); let version = 0; let hidden = false;
const deviceId = computed(() => String(route.params.deviceId || '')); const readings = computed(() => rows.value.filter((row) => row[metric.value] != null && !row.sensor_error && row.mode === 'fer'));
const selected = computed(() => selectedIndex.value >= 0 ? readings.value[selectedIndex.value] : null);
async function load() {
  const token = ++version; const owner = auth.user.value?.id; const id = deviceId.value;
  rows.value = []; selectedIndex.value = -1; baseline.value = null; loading.value = true; error.value = ''; completeness.value = '';
  if (!owner) { loading.value = false; return; }
  try {
    const service = await mobileDeviceService();
    const info = await service.getDevice(id, owner);
    let windows = [{ from: from.value, to: to.value }];
    if (starterId.value) {
      const links = await listStarterDeviceLinks({ userId: owner, starterId: starterId.value });
      windows = links.filter(link => link.device_id === id).map(link => ({ from: new Date(Math.max(Date.parse(from.value), Date.parse(link.active_from))).toISOString(), to: new Date(Math.min(Date.parse(to.value), link.active_to ? Date.parse(link.active_to) : Date.now())).toISOString() })).filter(window => Date.parse(window.to) > Date.parse(window.from));
      const feeds = await listCareRecords({ userId: owner, starterId: starterId.value, kind: 'feeding', to: from.value, limit: 1 });
      const value = feeds[0]?.input?.baselineHeightMm ?? feeds[0]?.input?.baseline_height_mm;
      if (token === version && value != null && Number.isFinite(Number(value)) && Number(value) > 0) baseline.value = Number(value);
    }
    const results = [];
    for (const window of windows) {
      if (Date.parse(window.to) - Date.parse(window.from) < 600000) continue;
      results.push(await service.range(id, window));
    }
    if (token !== version || owner !== auth.user.value?.id || id !== deviceId.value) return;
    device.value = info;
    rows.value = results.flatMap(result => result.rows.map((row,index) => ({ ...row, breakBefore: index === 0 || row.breakBefore }))).sort((a,b) => Date.parse(a.recorded_at)-Date.parse(b.recorded_at));
    completeness.value = results.some(result => !result.complete) ? '当前范围尚未完整加载，请缩小时间范围重试。' : '';
    selectedIndex.value = readings.value.length ? readings.value.length - 1 : -1;
  } catch (e) { if (token === version) error.value = e?.message || mobileError(e); }
  finally { if (token === version) loading.value = false; }
}
function applyRange() {
  let start; let end;
  try {
    start = parseLocalDateTime(draftFrom.value);
    end = parseLocalDateTime(draftTo.value);
  } catch (cause) { error.value = cause.message; return; }
  const message = validateRange(start.toISOString(), end.toISOString());
  if (message) { error.value = message; return; }
  from.value = start.toISOString(); to.value = end.toISOString();
  editingRange.value = false; error.value = '';
  load();
}
function cancelRange() { draftFrom.value = localDateTimeValue(new Date(from.value)); draftTo.value = localDateTimeValue(new Date(to.value)); editingRange.value = false; error.value = ''; }
function move(delta) { const next = selectedIndex.value + delta; if (next >= 0 && next < readings.value.length) selectedIndex.value = next; }
function onVisibility() { hidden = document.hidden; if (!hidden) load(); }
watch(metric, () => { selectedIndex.value = -1; });
watch(() => auth.user.value?.id, (next, old) => { if (next !== old) { version++; rows.value = []; device.value = null; selectedIndex.value = -1; baseline.value = null; loading.value = false; if (next) load(); } });
watch([deviceId, starterId], load);
onMounted(async () => { await auth.init(); document.addEventListener('visibilitychange', onVisibility); if (auth.user.value) load(); }); onBeforeUnmount(() => { version++; document.removeEventListener('visibilitychange', onVisibility); });
</script>
<template>
  <main class="m-page"><header><h1>{{ device?.name || '设备趋势' }}</h1><p class="m-muted">按十分钟展示，每桶取采样时间最新的一条。</p></header>
    <section class="m-card"><div class="m-range"><span>{{ new Date(from).toLocaleString() }}</span><span>至</span><span>{{ new Date(to).toLocaleString() }}</span><button class="m-secondary" @click="editingRange = true">调整范围</button></div><p v-if="completeness" class="m-error">{{ completeness }}</p></section>
    <section class="m-card"><div class="m-tabs"><button v-for="key in metrics" :key="key" :class="{ active: metric === key }" class="m-secondary" @click="metric = key">{{ METRICS[key].label }}</button></div><MobileMetricChart :rows="rows" :metric="metric" :from="from" :to="to" :baseline="baseline" @select="row => selectedIndex = readings.findIndex(item => item.id === row.id)"/><div class="m-reading-actions"><button class="m-secondary" :disabled="selectedIndex <= 0" @click="move(-1)">前一个点</button><button class="m-secondary" :disabled="selectedIndex < 0 || selectedIndex >= readings.length - 1" @click="move(1)">后一个点</button></div><div v-if="selected" class="m-card"><strong>{{ selected[metric] }} {{ METRICS[metric].unit }}</strong><p>{{ new Date(selected.recorded_at).toLocaleString() }}</p><p v-if="metric === 'height_mm' && baseline">Δ {{ (selected.height_mm - baseline).toFixed(1) }} mm · 膨胀率 {{ ((selected.height_mm - baseline) / baseline * 100).toFixed(0) }}%</p><p>发酵模式 · 有效采样</p></div></section>
    <section class="m-card"><h2>采样列表</h2><p v-if="!rows.length" class="m-muted">这个范围还没有采样。</p><div v-for="row in rows" :key="row.id" class="m-list-row"><span>{{ new Date(row.recorded_at).toLocaleString() }}</span><span>{{ row[metric] == null ? '未测量' : `${row[metric]} ${METRICS[metric].unit}` }}</span></div></section>
    <p v-if="loading" class="m-muted">正在加载趋势…</p><p v-if="error" class="m-error">{{ error }}</p>
    <div v-if="editingRange" class="m-card m-range-editor"><h2>调整时间范围</h2><label class="m-field">开始<input v-model="draftFrom" type="datetime-local"></label><label class="m-field">结束<input v-model="draftTo" type="datetime-local"></label><div class="m-actions"><button class="m-secondary" @click="cancelRange">取消</button><button class="m-primary" @click="applyRange">应用范围</button></div></div>
  </main>
</template>
<style scoped>
.m-page { max-width: 680px; margin: 0 auto; padding: 24px 20px 48px; color: #30251F; background: #FFF9F3; min-height: 100vh; } h1 { font-size: 28px; } h2 { font-size: 20px; margin-top: 0; } .m-card { border: 1px solid #EADDD2; padding: 16px; margin: 16px 0; background: #fffdfb; } .m-range, .m-actions, .m-reading-actions, .m-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; } button { min-height: 44px; border: 1px solid #8D796A; padding: 0 12px; font-size: 15px; background: transparent; } .m-primary { background: #FF6B25; color: #30251F; border-color: #FF6B25; flex: 1; } .m-secondary.active { border-color: #FF6B25; font-weight: 600; } .m-reading-actions button { flex: 1; } .m-list-row { min-height: 48px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #EADDD2; gap: 8px; } .m-muted { color: #75665B; line-height: 1.5; } .m-error { color: #9A352A; background: #FFF1ED; padding: 12px; } .m-field { display: grid; gap: 8px; margin: 12px 0; } input { min-height: 48px; border: 1px solid #8D796A; padding: 0 8px; font-size: 16px; } .m-actions button { flex: 1; }
</style>
