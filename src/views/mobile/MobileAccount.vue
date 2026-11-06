<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { changePassword } from '../../services/auth.service.js';
import MToast from '../../components/mobile/MToast.vue';

const auth = useAuth();
const form = reactive({ oldPassword: '', newPassword: '', confirm: '' });
const visible = reactive({ oldPassword: false, newPassword: false, confirm: false });
const busy = ref(false);
const error = ref('');
const toast = ref('');
const fields = [
  { key: 'oldPassword', label: '当前密码', placeholder: '请输入当前密码', autocomplete: 'current-password' },
  { key: 'newPassword', label: '新密码', placeholder: '请输入新密码', autocomplete: 'new-password' },
  { key: 'confirm', label: '确认新密码', placeholder: '请再次输入新密码', autocomplete: 'new-password' }
];
onMounted(() => auth.init());
async function submit() {
  if (busy.value) return;
  error.value = '';
  toast.value = '';
  if (form.newPassword.length < 6) { error.value = '新密码至少需要六位。'; return; }
  if (form.newPassword !== form.confirm) { error.value = '两次输入的新密码不一致。'; return; }
  busy.value = true;
  try {
    await changePassword({ oldPassword: form.oldPassword, newPassword: form.newPassword });
    Object.assign(form, { oldPassword: '', newPassword: '', confirm: '' });
    toast.value = '密码修改成功';
  } catch (cause) {
    error.value = cause?.message || '修改失败，请稍后重试。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="m-page account-page">
    <h1>修改密码</h1>
    <p class="lead">为了账号安全，请先验证当前密码。</p>
    <form @submit.prevent="submit">
      <label v-for="field in fields" :key="field.key" class="m-field">{{ field.label }}
        <span class="secret">
          <input v-model="form[field.key]" :type="visible[field.key] ? 'text' : 'password'" :autocomplete="field.autocomplete" :placeholder="field.placeholder" minlength="6" required>
          <button type="button" :aria-label="visible[field.key] ? `隐藏${field.label}` : `显示${field.label}`" :aria-pressed="visible[field.key]" @click="visible[field.key] = !visible[field.key]">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path v-if="visible[field.key]" d="M4 16 16 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </span>
      </label>
      <p class="rule">新密码须符合账号密码规则，且两次输入一致。</p>
      <p v-if="error" id="password-error" class="m-error" role="alert">{{ error }}</p>
      <button class="m-primary" :disabled="busy || !auth.user.value">{{ busy ? '修改中…' : '确认修改' }}</button>
    </form>
    <MToast :open="!!toast" :message="toast" @close="toast = ''" />
  </main>
</template>

<style scoped>
.account-page{min-height:calc(100dvh - 120px);overflow-wrap:anywhere}
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
.lead,.rule{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
form{display:flex;flex:1;flex-direction:column;gap:20px}
.account-page :deep(.m-field),form .m-field{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.secret{display:flex;align-items:center;gap:8px;min-height:64px;padding:0 8px 0 16px;border:1px solid var(--border-warm);border-radius:20px;background:var(--surface-card);box-shadow:0 4px 18px rgba(48,37,31,.07)}
.secret input{flex:1;min-width:0;height:44px;padding:0;border:0;background:transparent;color:var(--text-primary);font:inherit;font-size:16px;line-height:24px}
.secret input:focus{outline:none}
.secret button{display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;background:transparent;color:var(--text-secondary);cursor:pointer}
form .m-primary{margin-top:auto;min-height:60px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;font-weight:500;box-shadow:0 4px 16px rgba(48,37,31,.06);cursor:pointer}
form .m-primary:disabled{cursor:not-allowed}
</style>
