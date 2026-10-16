<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { getCareRecord, listStarters } from '../../services/care.service.js';
import { describeField } from '../../services/mobile-diagnosis.service.js';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const record = ref(null);
const name = ref('名称不可用');
const error = ref('');
const loading = ref(false);
const returnTo = computed(() => {
  const value = route.query.returnTo;
  if (typeof value !== 'string' || /[\\\u0000-\u0020\u007f]/.test(value)) return '/records';
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname === '/records' ? `${url.pathname}${url.search}${url.hash}` : '/records';
  } catch { return '/records'; }
});
const baseline = computed(() => record.value?.input?.baseline_height_mm ?? record.value?.feed_event?.baseline_height_mm ?? null);
const baselineSource = computed(() => record.value?.input?.baseline_source ?? record.value?.feed_event?.baseline_source);
const when = computed(() => record.value ? new Date(record.value.occurred_at).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
let generation = 0;
watch([() => user.value?.id, () => route.params.id], async ([userId, id]) => {
  const token = ++generation;
  record.value = null; name.value = '名称不可用'; error.value = ''; loading.value = false;
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
    try {
      const starters = await listStarters({ userId });
      if (token === generation) name.value = starters.find((item) => item.id === value.starter_id)?.name || '名称不可用';
    } catch { /* Reading facts does not require the current starter name. */ }
  } catch (cause) { if (token === generation) error.value = cause.message || '记录加载失败。'; }
  finally { if (token === generation) loading.value = false; }
}, { immediate: true });
onScopeDispose(() => { generation++; });
</script>

<template>
  <main class="m-page mobile-record-detail">
    <header><h1>喂养记录（只读）</h1></header>
    <p v-if="loading" role="status">正在加载…</p><p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <section v-if="record" class="m-card">
      <p>酵种：{{ name }} · {{ when }}</p>
      <h2>喂养比例（老种 : 水 : 面粉）</h2><p>{{ describeField('ratio', record.ratio) }}</p>
      <h2>起始高度</h2><p>{{ baseline == null ? '未记录' : `${baseline} mm` }}<span v-if="baseline != null">（{{ baselineSource === 'device' ? '设备读取' : baselineSource === 'manual' ? '手工记录' : '来源未记录' }}）</span></p>
      <p>这是一条事实记录，不生成诊断建议。</p>
      <RouterLink class="m-secondary" :to="{ path: '/checkin', query: { starter: record.starter_id, feeding: record.id, mode: 'diagnosis' } }">基于这次喂养记录做诊断</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.mobile-record-detail{max-width:42rem;margin:auto;overflow-wrap:anywhere}.m-card{margin:1rem 0;padding:1rem;border:1px solid #d8d2c8;background:#fffdf8}.m-secondary{display:inline-flex;align-items:center;min-height:48px;padding:0 1rem;border:1px solid #938d83;color:inherit;text-decoration:none}.m-error{color:#9a352a}
</style>
