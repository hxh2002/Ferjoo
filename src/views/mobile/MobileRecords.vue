<script>
const listPositions = new Map();
</script>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords, listStarters } from '../../services/care.service.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const starters = ref([]);
const rows = ref([]);
const loading = ref(false);
const error = ref('');
const namesError = ref('');
const listElement = ref(null);
const scrollY = ref(0);
const pageSize = 40;
const hasMore = ref(false);
const accountId = computed(() => auth.user.value?.id || '');
let generation = 0;
let namesGeneration = 0;
let disposed = false;
const queryText = (key) => typeof route.query[key] === 'string' ? route.query[key] : '';
const page = computed(() => {
  const value = Number(queryText('page'));
  return Number.isSafeInteger(value) && value >= 1 && value <= 1000000 ? value : 1;
});
function filterQuery() {
  return { starter: starterId.value, type: type.value, from: from.value, to: to.value, page: String(page.value) };
}
function positionKey(query = filterQuery()) {
  return JSON.stringify([accountId.value, query.starter, query.type, query.from, query.to, query.page]);
}
function updateFilter(key, value) {
  const query = { ...route.query, ...filterQuery(), [key]: value, page: '1', scroll: '0' };
  listPositions.delete(positionKey(query));
  router.replace({ path: '/records', query });
}
function changePage(value) {
  const query = { ...route.query, ...filterQuery(), page: String(value), scroll: '0' };
  listPositions.delete(positionKey(query));
  router.push({ path: '/records', query });
}
const starterId = computed({ get: () => queryText('starter'), set: (value) => updateFilter('starter', value) });
const type = computed({ get: () => ['feeding', 'observation'].includes(queryText('type')) ? queryText('type') : 'all', set: (value) => updateFilter('type', value) });
const from = computed({ get: () => queryText('from'), set: (value) => updateFilter('from', value) });
const to = computed({ get: () => queryText('to'), set: (value) => updateFilter('to', value) });
const groups = computed(() => {
  const map = new Map();
  for (const row of rows.value) {
    const key = new Date(row.occurred_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()];
});
function localDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请选择有效的本地日期。');
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== Number(value.slice(0, 4)) || date.getMonth() + 1 !== Number(value.slice(5, 7)) || date.getDate() !== Number(value.slice(8, 10))) throw new Error('请选择有效的本地日期。');
  return date;
}
function recordRange() {
  const start = from.value ? localDay(from.value) : null;
  const end = to.value ? localDay(to.value) : null;
  if (start && end && start > end) throw new Error('开始日期不能晚于结束日期。');
  if (end) end.setDate(end.getDate() + 1);
  return { start, end };
}
async function restoreScroll(token) {
  await nextTick();
  if (disposed || token !== generation || !listElement.value) return;
  const top = listPositions.get(positionKey()) ?? Number(queryText('scroll'));
  listElement.value.scrollTop = Number.isFinite(top) && top >= 0 ? top : 0;
  scrollY.value = listElement.value.scrollTop;
}
async function loadNames(owner) {
  const token = ++namesGeneration;
  const current = () => !disposed && token === namesGeneration && owner === accountId.value;
  starters.value = [];
  namesError.value = '';
  if (!owner) return;
  try {
    const names = await listStarters({ userId: owner });
    if (current()) starters.value = names;
  } catch {
    if (current()) namesError.value = '酵种名称暂不可用，记录仍可读取。';
  }
}
async function load() {
  const token = ++generation;
  const owner = accountId.value;
  const current = () => !disposed && token === generation && owner === accountId.value;
  rows.value = [];
  scrollY.value = 0;
  hasMore.value = false;
  loading.value = false;
  error.value = '';
  if (!owner) return;
  loading.value = true;
  try {
    const { start, end } = recordRange();
    const records = await listCareRecords({
      ...(starterId.value ? { starterId: starterId.value } : {}),
      ...(type.value !== 'all' ? { kind: type.value } : {}),
      ...(start ? { from: start.toISOString() } : {}),
      ...(end ? { to: end.toISOString() } : {}),
      userId: owner,
      limit: pageSize + 1,
      offset: (page.value - 1) * pageSize
    });
    if (!current()) return;
    hasMore.value = records.length > pageSize;
    rows.value = records.slice(0, pageSize);
  } catch (cause) {
    if (current()) error.value = cause?.message || '记录读取失败，请稍后重试。';
  } finally {
    if (current()) {
      loading.value = false;
      restoreScroll(token);
    }
  }
}
function starterName(id) {
  return starters.value.find((item) => item.id === id)?.name || '名称不可用';
}
function title(row) {
  if (row.kind === 'feeding') return `喂养 · ${row.ratio === 'deep_reset' ? '大比例刷新' : row.ratio || '比例未记录'}`;
  return row.result?.title || '观察记录';
}
function detailTarget(row) {
  const returnTo = router.resolve({ path: '/records', query: { ...filterQuery(), scroll: String(Math.max(0, scrollY.value)) } }).fullPath;
  return { path: `/reports/${row.id}`, query: { returnTo } };
}
function trackScroll() {
  if (loading.value || !listElement.value) return;
  scrollY.value = listElement.value.scrollTop;
  listPositions.set(positionKey(), scrollY.value);
}
watch(accountId, (owner, previous) => {
  if (previous) listPositions.clear();
  loadNames(owner);
}, { immediate: true, flush: 'sync' });
watch([accountId, starterId, type, from, to, page], load, { immediate: true });
watch(() => route.query.scroll, () => { if (!loading.value) restoreScroll(generation); });
onMounted(() => { auth.init(); });
onUnmounted(() => {
  disposed = true;
  generation++;
  namesGeneration++;
});
</script>

<template>
  <main class="m-page">
    <section class="m-card">
      <p class="m-eyebrow">记录</p><h1>最近的事实与建议</h1>
      <div class="m-filters">
        <label class="m-field">对象<select v-model="starterId"><option value="">全部酵种</option><option v-if="starterId && !starters.some(item => item.id === starterId)" :value="starterId">名称不可用（当前筛选）</option><option v-for="item in starters" :key="item.id" :value="item.id">{{ item.name || '名称不可用' }}</option></select></label>
        <div class="m-types" role="group" aria-label="类型筛选"><button v-for="item in [['all','全部'],['observation','观察'],['feeding','喂养']]" :key="item[0]" class="m-secondary" :class="{active:type===item[0]}" type="button" @click="type=item[0]">{{ item[1] }}</button></div>
        <label class="m-field">开始日期（本地）<input v-model="from" type="date"></label>
        <label class="m-field">结束日期（本地，含当天）<input v-model="to" type="date"></label>
      </div>
      <p v-if="loading" class="m-muted" role="status">正在读取记录…</p><p v-if="error" class="m-error" role="alert">{{ error }}</p>
      <p v-if="namesError" class="m-muted">{{ namesError }}</p>
    </section>
    <section v-if="!auth.user.value" class="m-card"><p>登录后读取你的喂养与观察记录。</p><RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }">去登录</RouterLink></section>
    <template v-else>
      <div ref="listElement" class="m-record-list" role="region" aria-label="记录列表，可滚动" tabindex="0" @scroll="trackScroll">
        <p v-if="!loading && !error && !rows.length" class="m-muted">当前范围没有记录。</p>
        <section v-for="group in groups" :key="group[0]" class="m-card">
          <h2>{{ group[0] }}</h2>
          <RouterLink v-for="row in group[1]" :key="row.id" class="m-list-row" :to="detailTarget(row)">
            <span><strong>{{ title(row) }}</strong><small>{{ starterName(row.starter_id) }} · {{ new Date(row.occurred_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }} · {{ row.kind === 'feeding' ? '喂养' : '观察' }}</small></span><b>详情</b>
          </RouterLink>
        </section>
      </div>
      <nav class="m-types" aria-label="记录分页">
        <button class="m-secondary" type="button" :disabled="loading || page <= 1" @click="changePage(page - 1)">上一页</button>
        <span>第 {{ page }} 页 · 每页 {{ pageSize }} 条</span>
        <button class="m-secondary" type="button" :disabled="loading || !hasMore" @click="changePage(page + 1)">下一页</button>
      </nav>
    </template>
  </main>
</template>

<style scoped>
.m-page{max-width:42rem;margin:auto;padding-bottom:calc(8rem + env(safe-area-inset-bottom))}.m-record-list{max-height:60vh;max-height:60dvh;overflow-y:auto;overscroll-behavior:contain;overflow-anchor:none}.m-card{margin:1rem 0;padding:1rem;border:1px solid #d8d2c8;background:#fffdf8}.m-eyebrow{color:#a44213;font-weight:700}.m-field{display:grid;gap:.5rem;margin:.75rem 0}.m-field select,.m-field input{box-sizing:border-box;width:100%;min-height:48px;padding:.7rem;font:inherit;border:1px solid #938d83;background:#fff}.m-types{display:flex;gap:.5rem;flex-wrap:wrap}.m-secondary{min-height:44px;padding:.6rem .9rem;border:1px solid #938d83;background:transparent;font:inherit;cursor:pointer}.m-secondary.active{border-color:#a44213;color:#a44213;font-weight:700}.m-list-row{display:flex;justify-content:space-between;gap:1rem;align-items:center;min-height:64px;border-top:1px solid #eadfd6;color:inherit;text-decoration:none}.m-list-row span{display:grid;gap:.2rem}.m-list-row small{color:#625e56}.m-list-row b{color:#a44213}.m-error{color:#9b2920}.m-muted{color:#625e56;font-size:.92rem}
</style>
