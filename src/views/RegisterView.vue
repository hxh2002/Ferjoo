<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthCard from '../components/AuthCard.vue';
import { signUpWithEmail } from '../services/auth.service.js';
import { useAuth } from '../composables/useAuth.js';
import { accountDestination, authLink, usesMobileAccountLayout } from '../lib/accountNavigation.js';

const form = reactive({ displayName: '', email: '', password: '', confirm: '', inviteCode: '' });
const error = ref('');
const success = ref('');
const busy = ref(false);
const auth = useAuth();
const route = useRoute();
const router = useRouter();

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
    if (data.session && usesMobileAccountLayout(route, router)) {
      await auth.syncSession();
      await router.replace(accountDestination(route, router));
      return;
    }
    success.value = data.session
      ? '注册成功，当前项目已允许直接登录。'
      : '注册成功。请按 Supabase 项目的设置前往邮箱完成确认，再登录。';
  } catch (e) {
    error.value = friendlyInviteError(e?.message) || e?.message || '注册失败。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <AuthCard eyebrow="JOIN DR. FERJOO" title="保存你的发酵轨迹。" description="邀请制注册：需要 8 位邀请码创建账号。">
      <div v-if="!auth.configured" class="config-warning">
        当前未配置 Supabase。诊断功能需登录后使用，请先复制 .env.example 为 .env 并填写项目配置。
      </div>
      <form class="auth-form" @submit.prevent="submit">
        <label>
          <span>邀请码 <b class="required-mark">*</b></span>
          <input
            v-model.trim="form.inviteCode"
            type="text"
            inputmode="numeric"
            maxlength="8"
            placeholder="8 位数字邀请码"
            autocomplete="off"
            required
          />
        </label>
        <label><span>显示名称 / 用户名</span><input v-model.trim="form.displayName" type="text" maxlength="80" /></label>
        <label><span>邮箱</span><input v-model.trim="form.email" type="email" autocomplete="email" required /></label>
        <label><span>密码</span><input v-model="form.password" type="password" autocomplete="new-password" required /></label>
        <label><span>确认密码</span><input v-model="form.confirm" type="password" autocomplete="new-password" required /></label>
        <p v-if="error" class="form-error">{{ error }}</p>
        <p v-if="success" class="form-success">{{ success }}</p>
        <button class="diagnose-button" :disabled="busy || !auth.configured">{{ busy ? '创建中…' : '创建账号' }}</button>
      </form>
      <p class="auth-switch">已经有账号？<RouterLink replace :to="authLink('login', route, router)">去登录 →</RouterLink></p>
    </AuthCard>
  </div>
</template>
