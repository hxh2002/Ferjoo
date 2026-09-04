<script setup>
import { reactive, ref } from 'vue';
import AuthCard from '../components/AuthCard.vue';
import { signUpWithEmail } from '../services/auth.service.js';
import { useAuth } from '../composables/useAuth.js';

const form = reactive({ displayName: '', email: '', password: '', confirm: '' });
const error = ref('');
const success = ref('');
const busy = ref(false);
const auth = useAuth();

async function submit() {
  error.value = '';
  success.value = '';
  if (form.password.length < 6) {
    error.value = '密码至少需要 6 位。';
    return;
  }
  if (form.password !== form.confirm) {
    error.value = '两次输入的密码不一致。';
    return;
  }
  busy.value = true;
  try {
    const data = await signUpWithEmail(form);
    success.value = data.session
      ? '注册成功，当前项目已允许直接登录。'
      : '注册成功。请按 Supabase 项目的设置前往邮箱完成确认，再登录。';
  } catch (e) {
    error.value = e?.message || '注册失败。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <AuthCard eyebrow="JOIN DR. FERJOO" title="保存你的发酵轨迹。" description="注册后，数据库触发器会生成形如 UYYMM0001 的系统用户编号。">
      <div v-if="!auth.configured" class="config-warning">
        当前未配置 Supabase。你可以先使用完整诊断功能，配置数据库后再启用账号与设备历史。
      </div>
      <form class="auth-form" @submit.prevent="submit">
        <label><span>显示名称</span><input v-model.trim="form.displayName" type="text" maxlength="80" /></label>
        <label><span>邮箱</span><input v-model.trim="form.email" type="email" autocomplete="email" required /></label>
        <label><span>密码</span><input v-model="form.password" type="password" autocomplete="new-password" required /></label>
        <label><span>确认密码</span><input v-model="form.confirm" type="password" autocomplete="new-password" required /></label>
        <p v-if="error" class="form-error">{{ error }}</p>
        <p v-if="success" class="form-success">{{ success }}</p>
        <button class="diagnose-button" :disabled="busy || !auth.configured">{{ busy ? '创建中…' : '创建账号' }}</button>
      </form>
      <p class="auth-switch">已经有账号？<RouterLink to="/login">去登录 →</RouterLink></p>
    </AuthCard>
  </div>
</template>
