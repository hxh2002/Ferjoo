<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import MobileMetricChart from '../../components/MobileMetricChart.vue';
import { METRICS, mobileDeviceService, mobileError, validateRange } from '../../services/mobile-device.service.js';
const route = useRoute(); const auth = useAuth();
const metrics = Object.keys(METRICS); const metric = ref(route.query.metric && METRICS[route.query.metric] ? route.query.metric : 'height_mm');
const now = new Date(); const defaultTo = now.toISOString(); const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
const from = ref(defaultFrom); const to = ref(defaultTo); const draftFrom = ref(defaultFrom); const draftTo = ref(defaultTo); const rows = ref([]); const device = ref(null); const loading = ref(false); const error = ref(''); const completeness = ref(''); const selectedIndex = ref(-1); const editingRange = ref(false); let version = 0; let hidden = false;
const deviceId = computed(() => String(route.params.deviceId || '')); const readings = computed(() => rows.value.filter((row) => row[metric.value] != null && !row.sensor_error && row.mode === 'fer'));
const selected = computed(() => selectedIndex.value >= 0 ? readings.value[selectedIndex.value] : null);
function inputValue(value) { return new Date(value).toISOString().slice(0, 16); }
async function load() { const token = ++version; loading.value = true; error.value = ''; completeness.value = ''; try { const service = await mobileDeviceService(); const [info, result] = await Promise.all([service.getDevice(deviceId.value, auth.user.value?.id), service.range(deviceId.value, { from: from.value, to: to.value })]); if (token !== version) return; device.value = info; rows.value = result.rows; completeness.value = result.error || (result.limited ? '已达到查询上限，当前仅加载了部分时间范围。' : result.complete ? '' : '当前范围尚未完整加载。'); selectedIndex.value = readings.value.length ? readings.value.length - 1 : -1; } catch (e) { if (token === version) error.value = mobileError(e); } finally { if (token === version) loading.value = false; } }
function applyRange() { const message = validateRange(draftFrom.value, draftTo.value); if (message) { error.value = message; return; } from.value = new Date(draftFrom.value).toISOString(); to.value = new Date(draftTo.value).toISOString(); editingRange.value = false; load(); }
function cancelRange() { draftFrom.value = inputValue(from.value); draftTo.value = inputValue(to.value); editingRange.value = false; error.value = ''; }
function move(delta) { const next = selectedIndex.value + delta; if (next >= 0 && next < readings.value.length) selectedIndex.value = next; }
function onVisibility() { hidden = document.hidden; if (!hidden) load(); }
watch(metric, () => { selectedIndex.value = readings.value.length ? readings.value.length - 1 : -1; });
watch(() => auth.user.value?.id, (next, old) => { if (next !== old) { rows.value = []; device.value = null; if (next) load(); } });
onMounted(async () => { await auth.init(); document.addEventListener('visibilitychange', onVisibility); if (auth.user.value) load(); }); onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility));
</script>
<template>
  <main class="m-page"><header><h1>{{ device?.name || '设备趋势' }}</h1><p class="m-muted">按十分钟展示，每桶取采样时间最新的一条。</p></header>
    <section class="m-card"><div class="m-range"><span>{{ new Date(from).toLocaleString() }}</span><span>至</span><span>{{ new Date(to).toLocaleString() }}</span><button class="m-secondary" @click="editingRange = true">调整范围</button></div><p v-if="completeness" class="m-error">{{ completeness }}</p></section>
    <section class="m-card"><div class="m-tabs"><button v-for="key in metrics" :key="key" :class="{ active: metric === key }" class="m-secondary" @click="metric = key">{{ METRICS[key].label }}</button></div><MobileMetricChart :rows="rows" :metric="metric" :from="from" :to="to" @select="row => selectedIndex = readings.findIndex(item => item.id === row.id)"/><div class="m-reading-actions"><button class="m-secondary" :disabled="selectedIndex <= 0" @click="move(-1)">前一个点</button><button class="m-secondary" :disabled="selectedIndex < 0 || selectedIndex >= readings.length - 1" @click="move(1)">后一个点</button></div><div v-if="selected" class="m-card"><strong>{{ selected[metric] }} {{ METRICS[metric].unit }}</strong><p>{{ new Date(selected.recorded_at).toLocaleString() }}</p></div></section>
    <section class="m-card"><h2>采样列表</h2><p v-if="!rows.length" class="m-muted">这个范围还没有采样。</p><div v-for="row in rows" :key="row.id" class="m-list-row"><span>{{ new Date(row.recorded_at).toLocaleString() }}</span><span>{{ row[metric] == null ? '未测量' : `${row[metric]} ${METRICS[metric].unit}` }}</span></div></section>
    <p v-if="loading" class="m-muted">正在加载趋势…</p><p v-if="error" class="m-error">{{ error }}</p>
    <div v-if="editingRange" class="m-card m-range-editor"><h2>调整时间范围</h2><label class="m-field">开始<input v-model="draftFrom" type="datetime-local"></label><label class="m-field">结束<input v-model="draftTo" type="datetime-local"></label><div class="m-actions"><button class="m-secondary" @click="cancelRange">取消</button><button class="m-primary" @click="applyRange">应用范围</button></div></div>
  </main>
</template>
<style scoped>
.m-page { max-width: 680px; margin: 0 auto; padding: 24px 20px 48px; color: #30251F; background: #FFF9F3; min-height: 100vh; } h1 { font-size: 28px; } h2 { font-size: 20px; margin-top: 0; } .m-card { border: 1px solid #EADDD2; padding: 16px; margin: 16px 0; background: #fffdfb; } .m-range, .m-actions, .m-reading-actions, .m-tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; } button { min-height: 44px; border: 1px solid #8D796A; padding: 0 12px; font-size: 15px; background: transparent; } .m-primary { background: #FF6B25; color: #30251F; border-color: #FF6B25; flex: 1; } .m-secondary.active { border-color: #FF6B25; font-weight: 600; } .m-reading-actions button { flex: 1; } .m-list-row { min-height: 48px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #EADDD2; gap: 8px; } .m-muted { color: #75665B; line-height: 1.5; } .m-error { color: #9A352A; background: #FFF1ED; padding: 12px; } .m-field { display: grid; gap: 8px; margin: 12px 0; } input { min-height: 48px; border: 1px solid #8D796A; padding: 0 8px; font-size: 16px; } .m-actions button { flex: 1; }
</style>
