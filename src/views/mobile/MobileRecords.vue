<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords, listStarters } from '../../services/care.service.js';

const auth = useAuth();
const starters = ref([]);
const starterId = ref('');
const type = ref('all');
const rows = ref([]);
const loading = ref(false);
const error = ref('');
const filtered = computed(() => type.value === 'all' ? rows.value : rows.value.filter((row) => row.kind === type.value));
const groups = computed(() => {
  const map = new Map();
  for (const row of filtered.value) {
    const key = new Date(row.occurred_at).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()];
});
async function load() {
  if (!auth.user.value) return;
  loading.value = true;
  error.value = '';
  try {
    starters.value = await listStarters();
    if (!starterId.value && starters.value[0]) starterId.value = starters.value[0].id;
    rows.value = await listCareRecords(starterId.value ? { starterId: starterId.value } : {});
  } catch (e) { error.value = e?.message || '记录读取失败，请稍后重试。'; }
  finally { loading.value = false; }
}
function title(row) {
  if (row.kind === 'feeding') return `喂养 · ${row.ratio || '比例未记录'}`;
  return row.result?.title || '观察记录';
}
onMounted(async () => { await auth.init(); await load(); });
watch(starterId, load);
</script>

<template>
  <main class="m-page">
    <section class="m-card">
      <p class="m-eyebrow">记录</p><h1>最近的事实与建议</h1>
      <div class="m-filters">
        <label class="m-field">对象<select v-model="starterId"><option value="">全部酵种</option><option v-for="item in starters" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <div class="m-types" role="group" aria-label="类型筛选"><button v-for="item in [['all','全部'],['observation','观察'],['feeding','喂养']]" :key="item[0]" class="m-secondary" :class="{active:type===item[0]}" type="button" @click="type=item[0]">{{ item[1] }}</button></div>
      </div>
      <p v-if="loading" class="m-muted">正在读取记录…</p><p v-if="error" class="m-error" role="alert">{{ error }}</p>
    </section>
    <section v-if="!auth.user.value" class="m-card"><p>登录后读取你的喂养与观察记录。</p><RouterLink to="/login?redirect=/records">去登录</RouterLink></section>
    <template v-else>
      <p v-if="!loading && !filtered.length" class="m-muted">当前范围没有记录；未加载与无记录不会混为一种状态。</p>
      <section v-for="group in groups" :key="group[0]" class="m-card">
        <h2>{{ group[0] }}</h2>
        <RouterLink v-for="row in group[1]" :key="row.id" class="m-list-row" :to="`/reports/${row.id}`">
          <span><strong>{{ title(row) }}</strong><small>{{ new Date(row.occurred_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }} · {{ row.kind === 'feeding' ? '喂养' : '观察' }}</small></span><b>详情</b>
        </RouterLink>
      </section>
    </template>
  </main>
</template>

<style scoped>
.m-page{max-width:42rem;margin:auto;padding-bottom:calc(8rem + env(safe-area-inset-bottom))}.m-card{margin:1rem 0;padding:1rem;border:1px solid #d8d2c8;background:#fffdf8}.m-eyebrow{color:#a44213;font-weight:700}.m-field{display:grid;gap:.5rem;margin:.75rem 0}.m-field select{min-height:48px;padding:.7rem;font:inherit;border:1px solid #938d83;background:#fff}.m-types{display:flex;gap:.5rem;flex-wrap:wrap}.m-secondary{min-height:44px;padding:.6rem .9rem;border:1px solid #938d83;background:transparent;font:inherit;cursor:pointer}.m-secondary.active{border-color:#a44213;color:#a44213;font-weight:700}.m-list-row{display:flex;justify-content:space-between;gap:1rem;align-items:center;min-height:64px;border-top:1px solid #eadfd6;color:inherit;text-decoration:none}.m-list-row span{display:grid;gap:.2rem}.m-list-row small{color:#625e56}.m-list-row b{color:#a44213}.m-error{color:#9b2920}.m-muted{color:#625e56;font-size:.92rem}
</style>
