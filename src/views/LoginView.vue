<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AuthCard from '../components/AuthCard.vue';
import { useAuth } from '../composables/useAuth.js';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const form = reactive({ email: '', password: '' });
const errorMessage = ref('');
const submitting = ref(false);

async function submit() {
  errorMessage.value = '';
  submitting.value = true;
  try {
    await auth.login(form.email, form.password);
    await router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/');
  } catch (error) {
    errorMessage.value = error?.message || '登录失败';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="auth-shell">
    <AuthCard title="登录" subtitle="使用邮箱和密码进入设备与历史数据空间。">
      <div v-if="!auth.supabaseConfigured" class="notice warn">
        Supabase 尚未配置；请先填写项目环境变量。
      </div>
      <form class="auth-form" @submit.prevent="submit">
        <label class="input-field">
          <span>邮箱</span>
          <input v-model="form.email" type="email" autocomplete="email" required />
        </label>
        <label class="input-field">
          <span>密码</span>
          <input v-model="form.password" type="password" autocomplete="current-password" minlength="6" required />
        </label>
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <button class="button primary wide" :disabled="submitting || !auth.supabaseConfigured">
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </form>
      <p class="auth-switch">还没有账号？ <RouterLink to="/register">创建账号</RouterLink></p>
    </AuthCard>
  </div>
</template>
