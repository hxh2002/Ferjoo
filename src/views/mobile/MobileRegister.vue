<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { signUpWithEmail } from '../../services/auth.service.js';
import { accountDestination, authLink } from '../../lib/accountNavigation.js';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const form = reactive({ email: '', password: '', confirm: '', inviteCode: '' });
const visible = reactive({ password: false, confirm: false });
const busy = ref(false);
const error = ref('');
const success = ref('');

const INVITE_ERROR_MESSAGES = {
  INVALID_INVITE_CODE: '邀请码无效，请检查后重试。',
  INVITE_QUOTA_EXCEEDED: '该邀请码的可邀请人数已达上限。',
  REGISTRATION_REQUIRES_INVITE: '当前仅限邀请注册，请填写邀请码。'
};

function friendlyInviteError(message = '') {
  for (const [code, text] of Object.entries(INVITE_ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return null;
}

async function submit() {
  if (busy.value) return;
  error.value = '';
  success.value = '';
  if (!/^\d{8}$/.test(form.inviteCode.trim())) {
    error.value = '请输入 8 位数字邀请码。';
    return;
  }
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
    if (data.session) {
      await auth.syncSession();
      await router.replace(accountDestination(route, router));
      return;
    }
    success.value = data.session
      ? '注册成功，当前项目已允许直接登录。'
      : '注册成功。请按 Supabase 项目的设置前往邮箱完成确认，再登录。';
  } catch (cause) {
    error.value = friendlyInviteError(cause?.message) || cause?.message || '注册失败。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="m-page register-page">
    <header class="auth-head">
      <h1>创建账号</h1>
      <p class="lead">邀请制注册：需要 8 位邀请码创建账号。</p>
    </header>
    <div v-if="!auth.configured" class="config-warning">
      当前未配置 Supabase。诊断功能需登录后使用，请先复制 .env.example 为 .env 并填写项目配置。
    </div>
    <form class="auth-form" @submit.prevent="submit">
      <label class="field">邀请码 <b class="required-mark">*</b>
        <span class="control">
          <input v-model.trim="form.inviteCode" type="text" inputmode="numeric" maxlength="8" placeholder="8 位数字邀请码" autocomplete="off" required>
        </span>
      </label>
      <label class="field">邮箱
        <span class="control">
          <input v-model.trim="form.email" type="email" inputmode="email" autocomplete="email" placeholder="请输入邮箱" required>
        </span>
      </label>
      <label class="field">密码
        <span class="control">
          <input v-model="form.password" :type="visible.password ? 'text' : 'password'" autocomplete="new-password" placeholder="请输入密码" required>
          <button type="button" :aria-label="visible.password ? '隐藏密码' : '显示密码'" :aria-pressed="visible.password" @click="visible.password = !visible.password">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path v-if="visible.password" d="M4 16 16 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </span>
      </label>
      <label class="field">确认密码
        <span class="control">
          <input v-model="form.confirm" :type="visible.confirm ? 'text' : 'password'" autocomplete="new-password" placeholder="请再次输入密码" required>
          <button type="button" :aria-label="visible.confirm ? '隐藏确认密码' : '显示确认密码'" :aria-pressed="visible.confirm" @click="visible.confirm = !visible.confirm">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path v-if="visible.confirm" d="M4 16 16 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </span>
      </label>
      <p class="note">密码至少 6 位。</p>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
      <p v-if="success" class="form-success" role="status">{{ success }}</p>
      <button class="m-primary" :disabled="busy || !auth.configured">{{ busy ? '创建中…' : '创建账号' }}</button>
    </form>
    <p class="switch">已经有账号？<RouterLink replace :to="authLink('mobile-login', route, router)">去登录 →</RouterLink></p>
  </main>
</template>

<style scoped>
.register-page{padding-top:16px;gap:24px}
.auth-head{display:grid;gap:8px}
.register-page .auth-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em;color:var(--text-primary)}
.lead{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.auth-form{display:flex;flex-direction:column;gap:16px}
.field{display:grid;gap:8px;margin:0;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.field b{font-weight:400}
.control{display:flex;align-items:center;gap:8px;min-height:64px;padding:0 12px 0 16px;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:var(--m-shadow-field)}
.control input{flex:1;min-width:0;height:24px;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:var(--text-primary);font:inherit;font-size:16px;line-height:24px}
.control input::placeholder{color:var(--text-secondary)}
.control button{display:grid;place-items:center;flex:none;width:44px;height:44px;padding:0;border:0;background:transparent;color:var(--text-secondary);cursor:pointer}
.note{margin:0;color:var(--text-secondary);font-size:12px;line-height:18px}
.m-primary{width:100%;height:60px;min-height:60px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;line-height:24px;font-weight:500;box-shadow:var(--m-shadow-button);cursor:pointer}
.switch{margin:0;text-align:center;color:var(--text-secondary);font-size:14px;line-height:21px}
.switch a{color:var(--brand-action);font-weight:500;text-decoration:none;text-underline-offset:3px}
</style>
