<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { mobileDeviceService, mobileError, normalizeBindCode } from '../../services/mobile-device.service.js';

const router = useRouter();
const auth = useAuth();
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
</script>

<template>
  <main class="m-page">
    <h1>添加设备</h1>
    <form class="m-card" @submit.prevent="submit">
      <label>设备编号<input v-model="code" autocomplete="off" autocapitalize="characters" maxlength="24" aria-describedby="code-error" /></label>
      <p v-if="error" id="code-error" class="m-error" role="alert">{{ error }}</p>
      <label class="confirm"><input v-model="confirmed" type="checkbox" />我确认：绑定后可查看这台设备的全部历史采样。</label>
      <button class="m-primary" :disabled="saving">{{ saving ? '绑定中…' : '绑定设备' }}</button>
    </form>
  </main>
</template>

<style scoped>
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
label{display:grid;gap:8px;font-size:var(--text-sm)}
input:not([type="checkbox"]){min-height:64px;padding:0 16px;border:1px solid var(--border-input);border-radius:var(--radius-control);background:var(--surface-input);color:var(--text-primary);font:inherit;font-size:16px}
input[type="checkbox"]{width:24px}
.confirm{display:flex;align-items:center;gap:8px;margin:12px 0}
.m-primary{width:100%;min-height:60px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary)}
</style>
