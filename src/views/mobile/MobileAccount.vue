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
<template><main class="m-page account-page"><p class="m-muted">当前邮箱：{{ auth.user.value?.email }}</p><form class="m-card" @submit.prevent="submit"><h2>修改密码</h2><label class="m-field">旧密码<input v-model="form.oldPassword" type="password" autocomplete="current-password" required></label><label class="m-field">新密码<input v-model="form.newPassword" type="password" autocomplete="new-password" minlength="6" required></label><label class="m-field">确认新密码<input v-model="form.confirm" type="password" autocomplete="new-password" minlength="6" required></label><p v-if="error" id="password-error" class="m-error" role="alert">{{ error }}</p><p v-if="notice" class="form-success" role="status">{{ notice }}</p><button class="m-primary" :disabled="busy || !auth.user.value">{{ busy ? '修改中…' : '修改密码' }}</button></form></main></template>
<style scoped>.account-page{max-width:42rem;margin:auto;padding:20px;overflow-wrap:anywhere}</style>
