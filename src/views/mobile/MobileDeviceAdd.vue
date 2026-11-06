<script setup>
import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService, mobileError, normalizeBindCode } from '../../services/mobile-device.service.js';

const router = useRouter();
const auth = useAuth();
const headerTone = inject('mobileHeaderTone', null);
const code = ref('');
const confirmed = ref(false);
const error = ref('');
const saving = ref(false);

async function submit() {
  error.value = '';
  if (!code.value.trim()) {
    error.value = '请输入设备编号。';
    return;
  }
  const normalized = normalizeBindCode(code.value);
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(normalized)) {
    error.value = '请输入有效的八位字母或数字绑定码。';
    return;
  }
  if (!confirmed.value) {
    error.value = '请先确认全部历史采样的共享范围。';
    return;
  }
  if (saving.value || !auth.user.value) return;
  saving.value = true;
  try {
    const service = await mobileDeviceService();
    const result = await service.claim(normalized);
    if (!result?.device_id) throw new Error('没有收到绑定结果。');
    router.replace(`/me/devices/${encodeURIComponent(result.device_id)}`);
  } catch (cause) {
    error.value = mobileError(cause);
  } finally {
    saving.value = false;
  }
}
onMounted(() => { if (headerTone) headerTone.value = 'settings'; });
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
</script>

<template>
  <main class="m-page add-device">
    <form @submit.prevent="submit">
      <label class="code-field">设备编号<input v-model="code" autocomplete="off" autocapitalize="characters" maxlength="24" placeholder="请输入设备编号" aria-describedby="code-hint code-error" /></label>
      <p id="code-hint" class="hint">编号可在设备标签或说明书中查看。</p>
      <p v-if="error" id="code-error" class="m-error" role="alert">{{ error }}</p>
      <label class="confirm"><input v-model="confirmed" type="checkbox" />我确认：绑定后可查看这台设备的全部历史采样。</label>
      <button class="m-primary" :disabled="saving">{{ saving ? '绑定中…' : '绑定设备' }}</button>
    </form>
  </main>
</template>

<style scoped>
.mobile-area .m-page.add-device{padding-top:16px}
.code-field{display:grid;gap:8px;color:var(--text-primary);font-size:var(--text-sm);line-height:21px}
input:not([type="checkbox"]){min-height:64px;padding:0 16px;border:1px solid var(--border-input);border-radius:var(--radius-control);background:var(--surface-input);color:var(--text-primary);font:inherit;font-size:var(--text-md);line-height:24px}
input[type="checkbox"]{width:24px;height:24px}
.hint{margin:8px 0 0;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
.confirm{display:flex;align-items:center;gap:8px;margin:16px 0;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
.m-primary{width:100%;min-height:60px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:var(--text-md);font-weight:500}
</style>
