<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { getCareRecord, saveObservation } from '../../services/care.service.js';
import { loadSessionReport, storeSessionReport, snapshot, protectResult, reportText, fieldLabels, describeField } from '../../services/mobile-diagnosis.service.js';

const route = useRoute();
const { user } = useAuth();
const accountId = computed(() => user.value?.id || 'guest');
const report = ref(null);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const copyStatus = ref('');
const readable = ref(false);
const cloud = computed(() => !!route.params.id);
const text = computed(() => report.value ? reportText(report.value) : '');
let generation = 0;
watch([accountId, () => route.params.id, () => route.path], async () => {
  const token = ++generation;
  report.value = null;
  error.value = '';
  copyStatus.value = '';
  readable.value = false;
  if (!cloud.value) { report.value = loadSessionReport(accountId.value); return; }
  loading.value = true;
  try {
    const record = await getCareRecord(route.params.id);
    if (token !== generation) return;
    if (!record) throw new Error('未找到记录，或你没有访问权限。');
    const value = snapshot(record);
    const input = value.input || value.payload?.input;
    const result = value.result || value.payload?.result;
    if (!input || !result) throw new Error('这不是一条包含建议快照的观察记录。');
    report.value = { ...value, input, result: protectResult(result, input), occurredAt: value.occurredAt || value.occurred_at, savedId: value.id || route.params.id };
  } catch (cause) { if (token === generation) error.value = cause.message || '加载失败，请稍后重试。'; }
  finally { if (token === generation) loading.value = false; }
}, { immediate: true });
async function save() {
  if (!report.value || cloud.value || saving.value || report.value.savedId) return;
  if (!user.value || !report.value.starterId) { error.value = '云端保存需要登录并选择酵种；当前结果仍可阅读。'; return; }
  const owner = accountId.value;
  const original = report.value;
  saving.value = true;
  error.value = '';
  try {
    const saved = await saveObservation({ requestId: original.requestId, starterId: original.starterId, occurredAt: original.occurredAt, input: snapshot(original.input), result: snapshot(original.result) });
    if (!saved?.id) throw new Error('未收到云端保存确认，请重试（沿用同一请求标识）。');
    const updated = { ...snapshot(original), savedId: saved.id };
    storeSessionReport(owner, updated);
    if (accountId.value === owner && report.value === original) report.value = updated;
  } catch (cause) { if (accountId.value === owner) error.value = cause.message || '尚未保存，检查网络后重试。'; }
  finally { saving.value = false; }
}
async function copy() {
  const owner = accountId.value;
  try {
    await navigator.clipboard.writeText(text.value);
    if (accountId.value === owner) copyStatus.value = '已复制建议文本。';
  } catch {
    if (accountId.value !== owner) return;
    readable.value = true;
    copyStatus.value = '无法自动复制。下方已展开可选择文本，请长按选择复制。';
  }
}
</script>

<template>
  <main class="m-page mobile-report">
    <header><RouterLink class="m-secondary" :to="cloud ? '/records' : '/today'">{{ cloud ? '返回记录' : '返回今天' }}</RouterLink><h1>{{ cloud ? '观察记录（只读）' : '本次建议' }}</h1></header>
    <p v-if="loading" role="status">正在加载云端记录…</p><p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <section v-if="!loading && !report" class="m-card"><h2>当前没有可读取的结果</h2><p>本机会话可能已结束、存储损坏或账号已切换。不会显示其他账号的报告。</p><RouterLink to="/checkin">继续或重新记录观察</RouterLink></section>
    <template v-if="report">
      <section class="m-card"><p role="status">{{ report.savedId ? '已云端保存' : '已生成，未云端保存' }}</p><p class="m-muted">观察时刻：{{ report.occurredAt }}<br>对象：{{ report.starterId || report.starter_id || '未选择，仅生成建议' }}</p><p>{{ report.result.badge }}</p><h2>{{ report.result.title }}</h2><p>{{ report.result.subtitle }}</p></section>
      <section class="m-card"><h2>下一步</h2><ul><li v-for="action in report.result.actions" :key="action">{{ action }}</li></ul><h3>为什么</h3><ul><li v-for="reason in report.result.reasons" :key="reason">{{ reason }}</li></ul></section>
      <section v-if="report.result.status !== 'discard' && (report.result.timing || report.result.timingNote || report.result.ph)" class="m-card"><h2>辅助信息</h2><p v-if="report.result.timing">{{ report.result.timing.display }}</p><p class="m-muted">{{ report.result.timingNote }}</p><p v-if="report.result.ph">{{ report.result.ph.label }}<br>{{ report.result.ph.message }}</p></section>
      <section v-if="report.result.safety?.length" class="m-card"><h2>安全提醒</h2><ul><li v-for="item in report.result.safety" :key="item">{{ item }}</li></ul></section>
      <details class="m-card"><summary>本次输入快照与来源</summary><p class="m-muted">{{ report.source || '已保存的观察快照' }}</p><dl><template v-for="(label, key) in fieldLabels" :key="key"><dt>{{ label }}</dt><dd>{{ describeField(key, report.input[key]) }}</dd></template></dl><p v-if="report.input.quickText">一句话原文：{{ report.input.quickText }}</p></details>
      <p v-if="!cloud && !report.starterId" class="m-muted">未选择对象，不能云端保存。<RouterLink to="/today">去今天添加或选择酵种</RouterLink>，再通过修改输入重新生成报告。</p>
      <p v-if="!cloud && !user" class="m-muted">登录后才能云端保存；账号切换不会迁移当前草稿。<RouterLink to="/login?redirect=/reports/session">前往登录</RouterLink></p>
      <button type="button" class="m-secondary" @click="copy">复制建议</button><p role="status">{{ copyStatus }}</p>
      <label v-if="readable" class="m-field">可选择的建议文本<textarea :value="text" readonly rows="12" /></label>
      <div v-if="!cloud" class="m-actions"><RouterLink class="m-secondary" :to="{ path: '/checkin', query: { edit: 'session', ...(report.starterId ? { starter: report.starterId } : {}) } }">修改本次输入</RouterLink><button class="m-primary" :disabled="saving || !!report.savedId || !user || !report.starterId" @click="save">{{ saving ? '保存中…' : report.savedId ? '已云端保存' : '保存到云端' }}</button></div>
    </template>
  </main>
</template>

<style scoped>
.mobile-report{max-width:42rem;margin:auto;padding-bottom:calc(11rem + env(safe-area-inset-bottom));overflow-wrap:anywhere}.m-card{margin:1rem 0;padding:1rem;background:#fffdf8;border:1px solid #d8d2c8}.m-actions{position:fixed;bottom:calc(var(--m-tab-height, 64px) + env(safe-area-inset-bottom));left:0;right:0;z-index:20;display:flex;justify-content:center;gap:.75rem;padding:.75rem;background:#fffdf8;border-top:1px solid #d8d2c8}.m-primary,.m-secondary{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;padding:.65rem 1rem;font:inherit;text-decoration:none;cursor:pointer}.m-primary{background:#a44213;border:1px solid #a44213;color:#fff}.m-secondary{border:1px solid #938d83;background:transparent;color:inherit}button:disabled{opacity:.55;cursor:default}.m-error{color:#9b2920}.m-muted{color:#625e56;font-size:.92rem}li{margin:.65rem 0}.m-field{display:grid;gap:.5rem;margin:1rem 0}textarea{width:100%;box-sizing:border-box;font:inherit;padding:.75rem}dt{font-weight:600;margin-top:.75rem}dd{margin:0;white-space:pre-wrap}summary{min-height:44px;cursor:pointer}
</style>
