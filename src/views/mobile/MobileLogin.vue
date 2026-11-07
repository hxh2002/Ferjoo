<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { signInWithEmail } from '../../services/auth.service.js';
import { accountDestination, authLink } from '../../lib/accountNavigation.js';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const form = reactive({ email: '', password: '' });
const visible = ref(false);
const busy = ref(false);
const error = ref('');

async function submit() {
  if (busy.value) return;
  error.value = '';
  busy.value = true;
  try {
    await signInWithEmail(form);
    await auth.syncSession();
    await router.replace(accountDestination(route, router));
  } catch (cause) {
    error.value = cause?.message || '登录失败，请检查邮箱与密码。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="m-page login-page">
    <header class="auth-head">
      <h1>欢迎回来</h1>
      <p class="lead">登录后查看设备与记录。</p>
    </header>
    <div v-if="!auth.configured" class="config-warning">
      当前未配置 Supabase。诊断功能需登录后使用，请先复制 .env.example 为 .env 并填写项目配置。
    </div>
    <form class="auth-form" @submit.prevent="submit">
      <label class="field">邮箱
        <span class="control">
          <input v-model.trim="form.email" type="email" inputmode="email" autocomplete="email" placeholder="请输入邮箱" required>
        </span>
      </label>
      <label class="field">密码
        <span class="control">
          <input v-model="form.password" :type="visible ? 'text' : 'password'" autocomplete="current-password" placeholder="请输入密码" required>
          <button type="button" :aria-label="visible ? '隐藏密码' : '显示密码'" :aria-pressed="visible" @click="visible = !visible">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path v-if="visible" d="M4 16 16 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </span>
      </label>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
      <button class="m-primary" :disabled="busy">{{ busy ? '登录中…' : '登录' }}</button>
    </form>
    <p class="switch">还没有账号？<RouterLink replace :to="authLink('mobile-register', route, router)">创建账号 →</RouterLink></p>
  </main>
</template>

<style scoped>
.login-page{padding-top:16px;gap:24px}
.auth-head{display:grid;gap:8px}
.login-page .auth-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em;color:var(--text-primary)}
.lead{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.auth-form{display:flex;flex-direction:column;gap:16px}
.field{display:grid;gap:8px;margin:0;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.control{display:flex;align-items:center;gap:8px;min-height:64px;padding:0 12px 0 16px;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:var(--m-shadow-field)}
.control input{flex:1;min-width:0;height:24px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:var(--text-primary);font:inherit;font-size:16px;line-height:24px}
.control input::placeholder{color:var(--text-secondary)}
.control button{display:grid;place-items:center;flex:none;width:44px;height:44px;padding:0;border:0;background:transparent;color:var(--text-secondary);cursor:pointer}
.m-primary{width:100%;height:60px;min-height:60px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;line-height:24px;font-weight:500;box-shadow:var(--m-shadow-button);cursor:pointer}
.switch{margin:0;text-align:center;color:var(--text-secondary);font-size:14px;line-height:21px}
.switch a{color:var(--brand-action);font-weight:500;text-decoration:none;text-underline-offset:3px}
</style>
