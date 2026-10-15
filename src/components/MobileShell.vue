<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { classicAssets } from '../constants/classicAssets.js';
import { isSharedAccountPage, safeRedirect } from '../lib/accountNavigation.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const tabs = [
  { path: '/today', label: '今天', icon: '○' },
  { path: '/records', label: '记录', icon: '▤' },
  { path: '/me', label: '我的', icon: '◇' }
];
const isAccount = computed(() => isSharedAccountPage(route));
const isTask = computed(() => ['/checkin', '/feeding', '/reports', '/me/devices', '/devices'].some((path) => route.path.startsWith(path)));
const showTabs = computed(() => !isTask.value && !isAccount.value);
const accountBack = computed(() => {
  if (route.name === 'claim') return { path: '/me/devices', label: '返回我的设备' };
  if (route.name === 'profile') return { path: '/me', label: '返回我的' };
  const redirect = safeRedirect(route.query.redirect, router);
  const protectedTarget = redirect && router.resolve(redirect).meta.requiresAuth;
  return redirect && !protectedTarget
    ? { path: redirect, label: '返回上一任务' }
    : { path: '/me', label: '返回我的' };
});
onMounted(() => auth.init());
function go(path) { router.push(path); }
</script>

<template>
  <div class="mobile-shell" :class="{ 'mobile-account-shell': isAccount }">
    <header class="mobile-topbar">
      <RouterLink class="mobile-brand" to="/today" aria-label="Ferjoo 今天"><img :src="classicAssets.logoBrand" alt="Ferjoo" /></RouterLink>
      <RouterLink v-if="!auth.user.value && !isAccount" class="mobile-login" :to="{ path: '/login', query: { redirect: route.fullPath } }">登录</RouterLink>
      <span v-else-if="auth.user.value" class="mobile-account">{{ auth.profile.value?.display_name || auth.user.value.email }}</span>
    </header>
    <nav v-if="isAccount" class="mobile-account-back" aria-label="账号页返回"><RouterLink :to="accountBack.path">← {{ accountBack.label }}</RouterLink></nav>
    <main class="mobile-main"><slot><RouterView /></slot></main>
    <nav v-if="showTabs" class="mobile-tabbar" aria-label="主要导航">
      <button v-for="tab in tabs" :key="tab.path" type="button" :class="{ active: route.path === tab.path }" @click="go(tab.path)"><span aria-hidden="true">{{ tab.icon }}</span><strong>{{ tab.label }}</strong></button>
    </nav>
  </div>
</template>

<style scoped>
.mobile-account-back { padding: 8px 20px; border-bottom: 1px solid #eaddd2; }
.mobile-account-back a { display: inline-flex; align-items: center; min-height: 44px; font-weight: 600; }
.mobile-account-shell :deep(.auth-page) { display: block; min-height: 0; padding: 20px 16px calc(32px + env(safe-area-inset-bottom)); }
.mobile-account-shell :deep(.auth-card) { width: 100%; max-width: 570px; margin: auto; padding: 24px 20px; box-sizing: border-box; border-radius: 0; }
.mobile-account-shell :deep(.auth-card h1) { font-size: 32px; letter-spacing: -.03em; }
.mobile-account-shell :deep(input), .mobile-account-shell :deep(select) { min-width: 0; max-width: 100%; font-size: 16px; }
.mobile-account-shell :deep(.profile-page) { max-width: 680px; margin: auto; padding: 20px 16px calc(32px + env(safe-area-inset-bottom)); }
.mobile-account-shell :deep(.profile-heading), .mobile-account-shell :deep(.profile-grid), .mobile-account-shell :deep(.profile-top) { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
.mobile-account-shell :deep(.profile-heading) { color: #30251f; margin: 0 0 20px; }
.mobile-account-shell :deep(.profile-heading h1) { font-size: 32px; }
.mobile-account-shell :deep(.profile-card) { padding: 20px; border-radius: 0; min-width: 0; }
.mobile-account-shell :deep(.profile-plate) { min-width: 0; border-color: #eaddd2; background: #fffdf8; }
.mobile-account-shell :deep(.meta-list dd) { overflow-wrap: anywhere; }
</style>
