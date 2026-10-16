<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { classicAssets } from '../constants/classicAssets.js';
import { isSharedAccountPage, safeRedirect } from '../lib/accountNavigation.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const tabs = [
  { path: '/today', label: '今日', icon: 'M12 21v-9m0 4C5 16 3 12 3 6c6 0 9 3 9 8m0-2c0-6 3-9 9-9 0 6-3 9-9 9' },
  { path: '/records', label: '记录', icon: 'M8 3h8v4H8z M8 5H5v16h14V5h-3 M8 11h8m-8 4h8' },
  { path: '/me', label: '我的', icon: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2' }
];
const cachedTabs = ['MobileToday', 'MobileRecords', 'MobileMe'];
const showTabs = computed(() => tabs.some((tab) => tab.path === route.path));
const isAccount = computed(() => isSharedAccountPage(route));
const title = computed(() => {
  if (typeof route.meta.title === 'string') return route.meta.title;
  if (route.path.startsWith('/devices/')) return '设备趋势';
  if (route.path.startsWith('/records/')) return '记录详情';
  if (route.path.startsWith('/reports/')) return '诊断报告';
  if (route.path.startsWith('/me/devices/')) return '设备设置';
  return ({ '/checkin': '记录观察', '/feeding': '记录喂养', '/reports': '诊断报告', '/me/devices': '我的设备', '/me/invite': '邀请好友', '/me/account': '账号安全', '/me/help': '帮助与关于', '/login': '登录', '/register': '注册', '/profile': '个人资料', '/claim': '绑定设备' })[route.path] || '养护详情';
});
const backTarget = computed(() => {
  const returnTo = safeRedirect(route.query.returnTo, router);
  if (returnTo && router.resolve(returnTo).path === '/records') return returnTo;
  if (route.path === '/claim') return '/me/devices';
  if (isAccount.value) {
    const redirect = safeRedirect(route.query.redirect, router);
    return redirect && !router.resolve(redirect).meta.requiresAuth ? redirect : '/me';
  }
  if (route.path.startsWith('/me/')) return '/me';
  if (route.path.startsWith('/devices/')) return '/me/devices';
  if (route.path.startsWith('/records/') || (route.path.startsWith('/reports/') && route.path !== '/reports/session')) return '/records';
  return '/today';
});
function goBack() {
  // 优先回到真实进入前页面；直接打开/刷新时才使用安全的逻辑上级页面。
  if (window.history.state?.back) router.back();
  else router.replace(backTarget.value);
}
const scrollPositions = new Map();
let frame;
const removeGuard = router.beforeEach((to, from) => {
  if (tabs.some((tab) => tab.path === from.path)) scrollPositions.set(from.path, window.scrollY);
});
const removeAfter = router.afterEach(async (to, from, failure) => {
  if (failure || to.path === from.path) return;
  await nextTick();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (route.fullPath === to.fullPath) window.scrollTo({ top: scrollPositions.get(to.path) || 0, behavior: 'instant' });
  });
});
onMounted(() => auth.init());
onBeforeUnmount(() => {
  removeGuard();
  removeAfter();
  cancelAnimationFrame(frame);
});
function go(path) {
  if (route.path !== path) router.push(path);
}
</script>

<template>
  <div class="mobile-shell" :class="{ 'mobile-account-shell': isAccount, 'has-tabs': showTabs }">
    <header v-if="showTabs" class="mobile-topbar">
      <RouterLink class="mobile-brand" to="/today" aria-label="Ferjoo 今日"><img :src="classicAssets.logoBrand" alt="Ferjoo" /></RouterLink>
      <RouterLink v-if="!auth.user.value" class="mobile-login" :to="{ path: '/login', query: { redirect: route.fullPath } }">登录</RouterLink>
      <RouterLink v-else class="mobile-account" to="/me">{{ auth.profile.value?.display_name || auth.user.value.email }}</RouterLink>
    </header>
    <header v-else class="mobile-topbar mobile-subbar">
      <button type="button" class="mobile-back" aria-label="返回上一页" @click="goBack">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg><span>返回</span>
      </button>
      <h1>{{ title }}</h1>
    </header>
    <main class="mobile-main">
      <slot>
        <RouterView v-slot="{ Component }">
          <KeepAlive :include="cachedTabs">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </slot>
    </main>
    <nav v-if="showTabs" class="mobile-tabbar" aria-label="主要导航">
      <button v-for="tab in tabs" :key="tab.path" type="button" :class="{ active: route.path === tab.path }" :aria-current="route.path === tab.path ? 'page' : undefined" @click="go(tab.path)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="tab.icon" /></svg><strong>{{ tab.label }}</strong>
      </button>
    </nav>
  </div>
</template>
