<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { changePassword } from '../../services/auth.service.js';
import MToast from '../../components/mobile/MToast.vue';

const auth = useAuth();
const form = reactive({ oldPassword: '', newPassword: '', confirm: '' });
const busy = ref(false);
const error = ref('');
const toast = ref('');
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
    <header class="account-head"><h1>修改密码</h1></header>
    <p class="group-label">当前账号</p>
    <section class="m-card account-mail">{{ auth.user.value?.email || '尚未登录' }}</section>
    <p class="group-label">账号安全</p>
    <form class="m-card" @submit.prevent="submit">
      <label class="m-field">旧密码<input v-model="form.oldPassword" type="password" autocomplete="current-password" required></label>
      <label class="m-field">新密码<input v-model="form.newPassword" type="password" autocomplete="new-password" minlength="6" required></label>
      <label class="m-field">确认新密码<input v-model="form.confirm" type="password" autocomplete="new-password" minlength="6" required></label>
      <p v-if="error" id="password-error" class="m-error" role="alert">{{ error }}</p>
      <button class="m-primary" :disabled="busy || !auth.user.value">{{ busy ? '修改中…' : '修改密码' }}</button>
    </form>
    <MToast :open="!!toast" :message="toast" @close="toast = ''" />
  </main>
</template>

<style scoped>
.account-page{overflow-wrap:anywhere}
.account-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
.group-label{margin:18px 0 8px;color:var(--text-secondary);font-size:14px;line-height:21px}
.account-mail{color:var(--text-primary);font-size:var(--text-md);line-height:24px}
</style>
