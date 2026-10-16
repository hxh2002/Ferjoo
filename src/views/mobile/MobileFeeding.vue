<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { saveFeeding } from '../../services/care.service.js';

import { useStarterName } from '../../composables/useStarterName.js';
import { randomUuid, isUuid } from '../../lib/uuid.js';
import { localDateTimeValue, parseLocalDateTime } from '../../lib/localDateTime.js';
import { loadObservationContext } from '../../services/mobile-diagnosis.service.js';

const route = useRoute();
const { user } = useAuth();
const accountId = computed(() => user.value?.id || 'guest');
const { draft, storageAvailable, persist, replace } = useCheckinDraft(accountId, { kind: 'feeding', defaults: () => ({ starterId: '', occurredAt: localDateTimeValue(), ratio: '', baselineHeightMm: '', baselineSource: '', deviceId: '', step: 1, requestId: '', submission: {}, confirmed: false }) });
const { starterName } = useStarterName(accountId, computed(() => draft.value.starterId));
const error = ref('');
const status = ref('');
const saving = ref(false);
const locked = computed(() => Object.keys(draft.value.submission).length > 0);
const deviceSample = ref(null);
let generation = 0;
watch(accountId, () => {
  generation += 1;
  saving.value = false;
  error.value = '';
  status.value = '';
}, { flush: 'sync' });
onScopeDispose(() => { generation += 1; });
watch([accountId, () => route.query.starter], async () => {
  if (!locked.value && typeof route.query.starter === 'string' && route.query.starter !== draft.value.starterId) {
    if (draft.value.starterId) replace({ starterId: route.query.starter });
    else draft.value.starterId = route.query.starter;
  }
  deviceSample.value = null;
  const token = generation;
  const owner = accountId.value;
  const starterId = draft.value.starterId;
  if (!user.value || !starterId || locked.value) return;
  try {
    const context = await loadObservationContext(owner, starterId);
    if (token !== generation || owner !== accountId.value || starterId !== draft.value.starterId) return;
    if (context.sample) deviceSample.value = { ...context.sample, device_id: context.link.device_id };
  } catch { if (token === generation) deviceSample.value = null; }
}, { immediate: true, flush: 'sync' });
function useDeviceHeight() {
  if (locked.value || saving.value || deviceSample.value?.height_mm == null) return;
  if (Date.now() - Date.parse(deviceSample.value.recorded_at) > 40 * 60000) { error.value = '设备读数已过期，请手工测量。'; return; }
  draft.value.baselineHeightMm = deviceSample.value.height_mm;
  draft.value.baselineSource = 'device';
  draft.value.deviceId = deviceSample.value.device_id;
}
function validate() {
  if (!isUuid(draft.value.starterId)) return '请先在今天添加或选择有效酵种；也可以返回后只做观察，不保存喂养。';
  try {
    if (parseLocalDateTime(draft.value.occurredAt) > new Date()) return '喂养时间不能晚于现在。';
  } catch (cause) { return cause.message; }
  if (!draft.value.ratio) return '请选择这次使用的喂养比例。';
  if (draft.value.baselineHeightMm !== '' && (!Number.isFinite(Number(draft.value.baselineHeightMm)) || Number(draft.value.baselineHeightMm) <= 0)) return '起始高度需为大于 0 的毫米数，未测量可留空。';
  return '';
}
function startNext() {
  if (saving.value || !draft.value.confirmed) return;
  try {
    const requestId = randomUuid();
    replace({ starterId: draft.value.starterId, occurredAt: localDateTimeValue(), ratio: '', requestId });
    status.value = '已开始下一条喂养记录，请填写本次事实。';
    error.value = '';
  } catch (cause) { error.value = cause.message; }
}
async function save() {
  if (saving.value || draft.value.confirmed) return;
  if (!user.value) { error.value = '保存喂养需要登录；草稿已在本机保留。'; return; }
  const token = generation;
  const owner = accountId.value;
  const current = () => token === generation && owner === accountId.value;
  saving.value = true; status.value = ''; error.value = '';
  try {
    if (!locked.value) {
      const invalid = validate();
      if (invalid) throw new Error(invalid);
      const requestId = isUuid(draft.value.requestId) ? draft.value.requestId : randomUuid();
      replace({ ...draft.value, requestId, submission: { requestId, starterId: draft.value.starterId, occurredAt: parseLocalDateTime(draft.value.occurredAt).toISOString(), ratio: draft.value.ratio, input: { baseline_height_mm: draft.value.baselineHeightMm === '' ? null : Number(draft.value.baselineHeightMm), baseline_source: draft.value.baselineSource || null } } });
    }
    // Persist the immutable operation before sending, including after a page reload.
    persist();
    if (!storageAvailable.value || !globalThis.localStorage) throw new Error('本机存储不可用，无法保证刷新后安全重试；请恢复存储后重试。');
    const payload = JSON.parse(JSON.stringify(draft.value.submission));
    if (!isUuid(payload.requestId) || payload.requestId !== draft.value.requestId) throw new Error('待确认草稿的请求编号无效，请勿重复新建，先核对已有记录。');
    const result = await saveFeeding(payload);
    if (!current()) return;
    if (!result?.id && result?.saved !== true) throw new Error('未收到云端保存确认。');
    draft.value.confirmed = true;
    persist();
    status.value = '已云端保存喂养记录。要记录另一次喂养，请明确开始下一条。';
  } catch (cause) {
    if (current()) error.value = `${cause.message || '保存未完成。'}${locked.value ? ' 本次内容已锁定，重试将沿用同一请求及内容，不会重复新增。' : ''}`;
  } finally { if (current()) saving.value = false; }
}
</script>

<template>
  <main class="m-page mobile-feeding">
    <header><RouterLink class="m-secondary" to="/today">返回今天</RouterLink><h1>记录喂养</h1><p class="m-muted">这里只记录已经发生的喂养，不会远程控制设备。</p></header>
    <section class="m-card"><p v-if="draft.starterId">当前酵种：{{ starterName }}</p><p v-else>尚未选择酵种。<RouterLink to="/today">去今天添加或选择对象</RouterLink>。</p><p v-if="!storageAvailable" class="m-error">本机存储不可用，关闭页面可能丢失草稿。</p></section>
    <form class="m-card" @submit.prevent="save">
      <p v-if="locked" role="status">{{ draft.confirmed ? '本条已确认保存；刷新页面不会重复新增。' : '本条提交尚待确认，内容已锁定；请重试确认原提交后再记录下一条。' }}</p>
      <label class="m-field">这次什么时候喂的<input v-model="draft.occurredAt" type="datetime-local" :disabled="locked || saving" required></label>
      <label class="m-field">喂养后起始高度（可选，mm）<input v-model="draft.baselineHeightMm" type="number" min="0" step="any" :disabled="locked || saving" @input="draft.baselineSource = 'manual'"><span class="m-muted">用于计算膨胀率。{{ deviceSample ? `设备最新读数：${deviceSample.height_mm ?? '未测量'}mm` : '可手工输入' }}</span></label>
      <button v-if="deviceSample?.height_mm != null" type="button" class="m-secondary" :disabled="locked || saving" @click="useDeviceHeight">使用设备最新高度</button><p class="m-muted">高度来源：{{ draft.baselineHeightMm === '' ? '未提供' : draft.baselineSource === 'device' ? '设备读取（已确认）' : '手工记录' }}</p>
      <label class="m-field">喂养比例（老种 : 水 : 面粉）<select v-model="draft.ratio" :disabled="locked || saving" required><option disabled value="">请选择</option><option value="1:1:1">1 : 1 : 1</option><option value="1:2:2">1 : 2 : 2</option><option value="1:3:3">1 : 3 : 3</option><option value="1:5:5">1 : 5 : 5</option><option value="deep_reset">大比例刷新</option><option value="1:2:1">1 : 2 : 1</option></select></label>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p><p v-if="status" role="status">{{ status }}</p>
      <div class="m-actions"><button v-if="draft.confirmed" type="button" class="m-primary" :disabled="saving" @click="startNext">开始下一条喂养记录</button><button v-else type="submit" class="m-primary" :disabled="saving">{{ saving ? '保存中…' : (locked ? '重试确认本次保存' : '保存喂养记录') }}</button><RouterLink class="m-secondary" :to="{ path: '/checkin', query: draft.starterId ? { starter: draft.starterId } : {} }">记录观察</RouterLink></div>
    </form>
  </main>
</template>

<style scoped>
.mobile-feeding{max-width:42rem;margin:auto;padding-bottom:calc(9rem + env(safe-area-inset-bottom))}.m-card{margin:1rem 0;padding:1rem;border:1px solid #d8d2c8;background:#fffdf8}.m-field{display:grid;gap:.5rem;margin:1rem 0}.m-field input,.m-field select{box-sizing:border-box;width:100%;min-height:48px;padding:.75rem;font:inherit;border:1px solid #938d83;border-radius:0;background:#fff}.m-actions{position:fixed;bottom:calc(0px + env(safe-area-inset-bottom));left:0;right:0;z-index:20;display:flex;justify-content:center;gap:.75rem;padding:.75rem;background:#fffdf8;border-top:1px solid #d8d2c8}.m-primary,.m-secondary{min-height:44px;padding:.65rem 1rem;font:inherit;text-decoration:none}.m-primary{background:#a44213;color:#fff;border:1px solid #a44213}.m-secondary{border:1px solid #938d83;background:transparent;color:inherit}.m-error{color:#9b2920}.m-muted{color:#625e56;font-size:.92rem}button:disabled{opacity:.55}
</style>
