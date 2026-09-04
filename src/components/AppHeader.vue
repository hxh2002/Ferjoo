<script setup>
import { useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';

const router = useRouter();
const auth = useAuth();

async function logout() {
  await auth.logout();
  await router.push('/');
}
</script>

<template>
  <header class="topbar">
    <RouterLink class="brand" to="/">
      <img src="/assets/logo.svg" alt="" />
      <span>
        <strong>Dr. Ferjoo</strong>
        <small>酵种医生</small>
      </span>
    </RouterLink>

    <nav class="nav-links" aria-label="主导航">
      <RouterLink to="/">诊断</RouterLink>
      <RouterLink v-if="auth.isAuthenticated.value" to="/history">设备历史</RouterLink>
    </nav>

    <div class="account-actions">
      <template v-if="auth.isAuthenticated.value">
        <div class="identity-pill">
          <strong>{{ auth.systemUserId.value || '已登录' }}</strong>
          <span>{{ auth.role.value === 'A' ? '管理员' : '用户' }}</span>
        </div>
        <button class="button ghost small" type="button" @click="logout">退出</button>
      </template>
      <template v-else>
        <RouterLink class="button ghost small" to="/login">登录</RouterLink>
        <RouterLink class="button small" to="/register">注册</RouterLink>
      </template>
    </div>
  </header>
</template>
