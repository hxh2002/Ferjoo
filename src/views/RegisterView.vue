<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AuthCard from '../components/AuthCard.vue';
import { useAuth } from '../composables/useAuth.js';

const auth = useAuth();
const router = useRouter();
const form = reactive({ email: '', displayName: '', password: '', confirmPassword: '' });
const errorMessage = ref('');
const successMessage = ref('');
const submitting = ref(false);

async function submit() {
  errorMessage.value = '';
  successMessage.value = '';
  if (form.password !== form.confirmPassword) {
    errorMessage.value = '两次输入的密码不一致。';
    return;
  }

  submitting.value = true;
  try {
    const data = await auth.register(form.email, form.password, form.displayName);
    if (!data.session) {
      successMessage.value = '注册成功，验证邮件已发送。请查收邮箱完成确认后再登录。';
      return;
    }
    await auth.refreshProfile();
    await router.push('/');
  } catch (error) {
    errorMessage.value = error?.message || '注册失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-shell">
    <AuthCard title="创建账号" subtitle="注册后系统会自动分配 U + YYMM + 4 位序号的用户 ID。">
      <div class="notice">
        注册后会向你的邮箱发送验证邮件，请完成邮箱确认后再登录。
      </div>
      <div v-if="!auth.supabaseConfigured" class="notice warn">
        Supabase 尚未配置；请先填写项目环境变量。
      </div>
      <form class="auth-form" @submit.prevent="submit">
        <label class="input-field">
          <span>邮箱</span>
          <input v-model="form.email" type="email" autocomplete="email" required />
        </label>
        <label class="input-field">
          <span>显示名称（可选）</span>
          <input v-model="form.displayName" type="text" maxlength="80" />
        </label>
        <label class="input-field">
          <span>密码</span>
          <input v-model="form.password" type="password" minlength="6" autocomplete="new-password" required />
        </label>
        <label class="input-field">
          <span>确认密码</span>
          <input v-model="form.confirmPassword" type="password" minlength="6" autocomplete="new-password" required />
        </label>
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <p v-if="successMessage" class="notice success">{{ successMessage }}</p>
        <button class="button primary wide" :disabled="submitting || !auth.supabaseConfigured">
          {{ submitting ? '注册中…' : '注册并登录' }}
        </button>
      </form>
      <p class="auth-switch">已有账号？ <RouterLink to="/login">直接登录</RouterLink></p>
    </AuthCard>
  </div>
</template>
