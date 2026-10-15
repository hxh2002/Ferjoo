<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthCard from '../components/AuthCard.vue';
import { signInWithEmail } from '../services/auth.service.js';
import { useAuth } from '../composables/useAuth.js';
import { isMobileBrowser } from '../lib/device.js';

const form = reactive({ email: '', password: '' });
const error = ref('');
const busy = ref(false);
const route = useRoute();
const router = useRouter();
const auth = useAuth();

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    await signInWithEmail(form);
    await auth.syncSession();
    await router.push(String(route.query.redirect || (isMobileBrowser() ? '/today' : '/history')));
  } catch (e) {
    error.value = e?.message || '登录失败，请检查邮箱与密码。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <AuthCard title="欢迎回来。" description="登录后查看设备、10 分钟测量记录与个人 Ferjoo 身份。">
      <div v-if="!auth.configured" class="config-warning">
        当前未配置 Supabase。诊断功能需登录后使用，请先复制 .env.example 为 .env 并填写项目配置。
      </div>
      <form class="auth-form" @submit.prevent="submit">
        <label><span>邮箱</span><input v-model.trim="form.email" type="email" autocomplete="email" required /></label>
        <label><span>密码</span><input v-model="form.password" type="password" autocomplete="current-password" required /></label>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button class="diagnose-button" :disabled="busy || !auth.configured">{{ busy ? '登录中…' : '登录' }}</button>
      </form>
      <p class="auth-switch">还没有账号？<RouterLink to="/register">创建账号 →</RouterLink></p>
    </AuthCard>
  </div>
</template>
