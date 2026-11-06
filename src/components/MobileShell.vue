<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, provide, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { isSharedAccountPage, safeRedirect } from '../lib/accountNavigation.js';

import navDevice from '../assets/icons/nav-device.svg';
import navDeviceActive from '../assets/icons/nav-device-active.svg';
import navDiary from '../assets/icons/nav-diary.svg';
import navDiaryActive from '../assets/icons/nav-diary-active.svg';
import navMe from '../assets/icons/nav-me.svg';
import navMeActive from '../assets/icons/nav-me-active.svg';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const tabs = [
  { path: '/device', label: '设备', icon: navDevice, activeIcon: navDeviceActive, wide: true },
  { path: '/diary', label: '日记', icon: navDiary, activeIcon: navDiaryActive },
  { path: '/me', label: '我的', icon: navMe, activeIcon: navMeActive }
];
const activeTab = computed(() => tabs.findIndex((tab) => tab.path === route.path));
const sliderPosition = ref(Math.max(0, activeTab.value));
let sliderFrame;
let motionPreference;
function moveSlider(index, previous) {
  cancelAnimationFrame(sliderFrame);
  if (index < 0) return;
  if (previous < 0 || motionPreference?.matches) {
    sliderPosition.value = index;
    return;
  }
  const from = sliderPosition.value;
  const start = performance.now();
  const animate = (now) => {
    const progress = Math.min(1, (now - start) / 360);
    // 轻微回弹，连续点击从当前帧位置接续，终帧精确落在目标。
    const eased = 1 + 2.2 * (progress - 1) ** 3 + 1.2 * (progress - 1) ** 2;
    sliderPosition.value = from + (index - from) * eased;
    if (progress < 1) sliderFrame = requestAnimationFrame(animate);
  };
  sliderFrame = requestAnimationFrame(animate);
}
watch(activeTab, moveSlider);
function settleSlider() {
  if (motionPreference.matches) {
    cancelAnimationFrame(sliderFrame);
    sliderPosition.value = Math.max(0, activeTab.value);
  }
}
const cachedTabs = ['MobileDeviceHome', 'MobileDiary', 'MobileMe'];
const showTabs = computed(() => tabs.some((tab) => tab.path === route.path));
const isAccount = computed(() => isSharedAccountPage(route));
const headerAside = ref('');
const headerTitle = ref('');
const headerTone = ref('');
provide('mobileHeaderAside', headerAside);
provide('mobileHeaderTitle', headerTitle);
provide('mobileHeaderTone', headerTone);
const title = computed(() => {
  if (headerTitle.value) return headerTitle.value;
  if (typeof route.meta.title === 'string') return route.meta.title;
  if (route.path === '/me/devices/add') return '添加设备';
  if (/^\/me\/devices\/[^/]+\/info$/.test(route.path)) return '设备信息';
  if (route.path.startsWith('/devices/')) return '数据详情';
  if (route.path.startsWith('/doctor/')) return '酵种医生';
  if (route.path.startsWith('/diary/records/')) return '数据详情';
  if (route.path.startsWith('/reports/')) return '诊断报告';
  if (route.path.startsWith('/me/devices/')) return '设备设置';
  return ({ '/checkin': '诊断记录', '/feeding': '记录喂养', '/reports': '诊断报告', '/me': '我的', '/me/devices': '我的设备', '/me/profile': '个人资料', '/me/profile/edit': '编辑资料', '/me/invite': '我的邀请码', '/me/notifications': '通知设置', '/me/account': '修改密码', '/me/help': '关于与帮助', '/me/help/faq': '常见问题', '/me/help/feedback': '意见反馈', '/me/help/privacy': '隐私与权限', '/login': '登录', '/register': '注册', '/profile': '个人资料', '/claim': '绑定设备' })[route.path] || '养护详情';
});
const navTone = computed(() => {
  if (headerTone.value) return headerTone.value;
  if (route.path === '/feeding') return 'feeding';
  if (route.path.startsWith('/diary/records/') || route.path.startsWith('/devices/') || route.path.startsWith('/reports/')) return 'detail';
  return '';
});
const backTarget = computed(() => {
  const returnTo = safeRedirect(route.query.returnTo, router);
  if (returnTo && router.resolve(returnTo).path === '/diary') return returnTo;
  if (route.path === '/claim') return '/me/devices';
  if (isAccount.value) {
    const redirect = safeRedirect(route.query.redirect, router);
    return redirect && !router.resolve(redirect).meta.requiresAuth ? redirect : '/me';
  }
  if (route.path.startsWith('/me/help/')) return '/me/help';
  if (route.path === '/me/profile/edit') return '/me/profile';
  if (route.path === '/me/devices/add') return '/me/devices';
  if (/^\/me\/devices\/[^/]+\/info$/.test(route.path)) return route.path.replace(/\/info$/, '');
  if (route.path.startsWith('/me/')) return '/me';
  if (route.path.startsWith('/devices/')) return '/me/devices';
  if (route.path.startsWith('/doctor/')) return '/diary';
  if (route.path.startsWith('/diary/records/') || (route.path.startsWith('/reports/') && route.path !== '/reports/session')) return '/diary';
  return '/device';
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
onMounted(() => {
  auth.init();
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionPreference.addEventListener('change', settleSlider);
  settleSlider();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(sliderFrame);
  motionPreference?.removeEventListener('change', settleSlider);
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
    <header v-if="!showTabs" class="mobile-topbar mobile-subbar" :class="navTone ? `is-${navTone}` : ''">
      <button type="button" class="mobile-back" aria-label="返回上一页" @click="goBack">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg><span v-if="!navTone">返回</span>
      </button>
      <h1>{{ title }}</h1>
      <span v-if="headerAside" class="mobile-aside">{{ headerAside }}</span>
    </header>
    <main class="mobile-main">
      <slot>
        <RouterView v-slot="{ Component }">
          <Transition name="mobile-page">
            <KeepAlive :include="cachedTabs">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </slot>
    </main>
    <nav v-if="showTabs" class="mobile-tabbar" aria-label="主要导航" :style="{ '--slider-position': sliderPosition }">
      <span class="mobile-tab-slider" aria-hidden="true"></span>
      <button v-for="tab in tabs" :key="tab.path" type="button" :class="{ active: route.path === tab.path }" :aria-label="tab.label" :aria-current="route.path === tab.path ? 'page' : undefined" @click="go(tab.path)">
        <img class="tab-icon tab-icon-idle" :class="{ 'tab-icon-device': tab.wide }" :src="tab.icon" alt="" width="28" height="28" />
        <img class="tab-icon tab-icon-active" :class="{ 'tab-icon-device': tab.wide }" :src="tab.activeIcon" alt="" width="28" height="28" />
      </button>
    </nav>
  </div>
</template>

<style scoped>
.mobile-subbar.is-feeding,
.mobile-subbar.is-detail,
.mobile-subbar.is-settings { border-bottom: 0; background: transparent; box-shadow: none; }
.mobile-subbar.is-feeding h1 { font-size: 24px; font-weight: 500; line-height: 35px; letter-spacing: 0; }
.mobile-subbar.is-detail h1 { font-size: 20px; font-weight: 500; line-height: 29px; letter-spacing: 0; }
.mobile-subbar.is-settings { flex-wrap: wrap; align-items: flex-start; min-height: 0; padding-bottom: 0; }
.mobile-subbar.is-settings h1 { flex: 1 0 100%; margin: 8px 0 0; font-size: 28px; font-weight: 500; line-height: 36px; letter-spacing: 0; }
.mobile-subbar.is-feeding .mobile-back,
.mobile-subbar.is-detail .mobile-back { position: relative; width: 24px; min-width: 24px; }
.mobile-subbar.is-settings .mobile-back { width: 44px; min-width: 44px; min-height: 44px; }
.mobile-aside { margin-left: auto; color: var(--text-secondary); font-size: 13px; font-weight: 400; line-height: 22px; white-space: nowrap; }
.mobile-page-enter-active { animation: mobile-arrive 280ms cubic-bezier(.2, .8, .3, 1); }
.mobile-shell :deep(details[open] > :not(summary)),
.mobile-shell :deep(.picker-row),
.mobile-shell :deep(.close-panel) { animation: mobile-unfold 220ms ease-out; }
@keyframes mobile-arrive {
  from { opacity: .35; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes mobile-unfold {
  from { opacity: .4; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .mobile-page-enter-active,
  .mobile-shell :deep(details[open] > :not(summary)),
  .mobile-shell :deep(.picker-row),
  .mobile-shell :deep(.close-panel) { animation: none !important; }
}
</style>
