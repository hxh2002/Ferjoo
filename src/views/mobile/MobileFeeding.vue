<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { saveFeeding } from '../../services/care.service.js';

function localDateTimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const accountId = computed(() => user.value?.id || 'guest');
const { draft, storageAvailable } = useCheckinDraft(accountId, { kind: 'feeding', defaults: () => ({ starterId: '', occurredAt: localDateTimeValue(), ratio: '', step: 1 }) });
const error = ref('');
const status = ref('');
const saving = ref(false);
const requestId = ref(globalThis.crypto?.randomUUID?.() || `feeding-${Date.now()}`);
if (typeof route.query.starter === 'string') draft.value.starterId = route.query.starter;
function validate() {
  error.value = '';
  if (!draft.value.starterId) return '请先在今天添加或选择酵种；也可以返回后只做观察，不保存喂养。';
  if (!draft.value.occurredAt || new Date(draft.value.occurredAt) > new Date()) return '喂养时间不能为空，也不能晚于现在。';
  if (!draft.value.ratio) return '请选择这次使用的喂养比例。';
  return '';
}
async function save() {
  const invalid = validate();
  if (invalid) { error.value = invalid; return; }
  if (!user.value) { error.value = '保存喂养需要登录；草稿已在本机保留。'; return; }
  saving.value = true; status.value = ''; error.value = '';
  try {
    const result = await saveFeeding({ requestId: requestId.value, starterId: draft.value.starterId, occurredAt: new Date(draft.value.occurredAt).toISOString(), ratio: draft.value.ratio });
    if (!result?.id && result?.saved !== true) throw new Error('未收到云端保存确认，请重试。');
    status.value = '已云端保存喂养记录。';
  } catch (cause) { error.value = cause.message || '保存失败，请重试；重试会沿用同一请求标识。'; }
  finally { saving.value = false; }
}
</script>

<template>
  <main class="m-page mobile-feeding">
    <header><RouterLink class="m-secondary" to="/today">返回今天</RouterLink><h1>记录喂养</h1><p class="m-muted">这里只记录已经发生的喂养，不会远程控制设备。</p></header>
    <section class="m-card"><p v-if="draft.starterId">当前酵种：{{ draft.starterId }}</p><p v-else>尚未选择酵种。<RouterLink to="/today">去今天添加或选择对象</RouterLink>。</p><p v-if="!storageAvailable" class="m-error">本机存储不可用，关闭页面可能丢失草稿。</p></section>
    <form class="m-card" @submit.prevent="save">
      <label class="m-field">这次什么时候喂的<input v-model="draft.occurredAt" type="datetime-local" required></label>
      <label class="m-field">喂养比例（老种 : 水 : 面粉）<select v-model="draft.ratio" required><option disabled value="">请选择</option><option value="1:1:1">1 : 1 : 1</option><option value="1:2:2">1 : 2 : 2</option><option value="1:3:3">1 : 3 : 3</option><option value="1:5:5">1 : 5 : 5</option><option value="deep_reset">大比例刷新</option><option value="1:2:1">1 : 2 : 1</option></select></label>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p><p v-if="status" role="status">{{ status }}</p>
      <div class="m-actions"><button type="submit" class="m-primary" :disabled="saving">{{ saving ? '保存中…' : '保存喂养记录' }}</button><RouterLink class="m-secondary" :to="{ path: '/checkin', query: draft.starterId ? { starter: draft.starterId } : {} }">记录观察</RouterLink></div>
    </form>
  </main>
</template>

<style scoped>
.mobile-feeding{max-width:42rem;margin:auto;padding-bottom:calc(9rem + env(safe-area-inset-bottom))}.m-card{margin:1rem 0;padding:1rem;border:1px solid #d8d2c8;background:#fffdf8}.m-field{display:grid;gap:.5rem;margin:1rem 0}.m-field input,.m-field select{box-sizing:border-box;width:100%;min-height:48px;padding:.75rem;font:inherit;border:1px solid #938d83;border-radius:0;background:#fff}.m-actions{position:fixed;bottom:calc(var(--m-tab-height, 64px) + env(safe-area-inset-bottom));left:0;right:0;z-index:20;display:flex;justify-content:center;gap:.75rem;padding:.75rem;background:#fffdf8;border-top:1px solid #d8d2c8}.m-primary,.m-secondary{min-height:44px;padding:.65rem 1rem;font:inherit;text-decoration:none}.m-primary{background:#a44213;color:#fff;border:1px solid #a44213}.m-secondary{border:1px solid #938d83;background:transparent;color:inherit}.m-error{color:#9b2920}.m-muted{color:#625e56;font-size:.92rem}button:disabled{opacity:.55}
</style>
