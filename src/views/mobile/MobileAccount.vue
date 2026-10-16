<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { changePassword } from '../../services/auth.service.js';
const auth = useAuth(); const form = reactive({ oldPassword: '', newPassword: '', confirm: '' }); const busy = ref(false); const error = ref(''); const notice = ref('');
onMounted(() => auth.init());
async function submit() {
  if (busy.value) return;
  error.value = ''; notice.value = '';
  if (form.newPassword.length < 6) { error.value = '新密码至少需要六位。'; return; }
  if (form.newPassword !== form.confirm) { error.value = '两次输入的新密码不一致。'; return; }
  busy.value = true;
  try { await changePassword({ oldPassword: form.oldPassword, newPassword: form.newPassword }); Object.assign(form, { oldPassword: '', newPassword: '', confirm: '' }); notice.value = '密码已修改，下次登录请使用新密码。'; } catch (cause) { error.value = cause?.message || '修改失败，请稍后重试。'; } finally { busy.value = false; }
}
</script>
<template><main class="m-page account-page"><p class="m-muted">当前邮箱：{{ auth.user.value?.email }}</p><form @submit.prevent="submit"><h2>修改密码</h2><label>旧密码<input v-model="form.oldPassword" type="password" autocomplete="current-password" required></label><label>新密码<input v-model="form.newPassword" type="password" autocomplete="new-password" minlength="6" required></label><label>确认新密码<input v-model="form.confirm" type="password" autocomplete="new-password" minlength="6" required></label><p v-if="error" id="password-error" role="alert">{{ error }}</p><p role="status">{{ notice }}</p><button :disabled="busy || !auth.user.value">{{ busy ? '修改中…' : '修改密码' }}</button></form></main></template>
<style scoped>.account-page{max-width:42rem;margin:auto;padding:20px;overflow-wrap:anywhere}form{padding:16px;border:1px solid #d8d2c8;background:#fffdf8}label{display:grid;gap:8px;margin:16px 0}input{box-sizing:border-box;width:100%;min-width:0;min-height:48px;font-size:16px;border:1px solid #938d83;padding:8px}button{min-height:48px;padding:8px 16px;font:inherit;background:#a54214;color:white;border:1px solid #a54214}[role=alert]{color:#9a352a}</style>
