<script setup>
import '../assets/desktop.css';
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { desktopNavItems } from '../lib/desktop-nav.js';
import DrFerjooMark from './DrFerjooMark.vue';

// 宽屏侧栏与顶栏。它和手机顶栏、底部标签同时存在于 DOM，是否可见只由 desktop.css 的 768px 断点决定；
// 账号、路由和页面数据都复用 MobileShell 与页面本身的状态。
defineProps({ title: { type: String, default: '' } });
const route = useRoute();
const auth = useAuth();
onMounted(() => auth.init());

const accountName = computed(() => auth.profile.value?.display_name || auth.profile.value?.system_user_id || auth.user.value?.email || '我的');
const accountInitial = computed(() => accountName.value.trim().slice(0, 1).toUpperCase() || '我');

const paths = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6',
  calendar: 'M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1M8 12h2M14 12h2M8 16h2M14 16h2',
  doctor: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM5 21v-2a7 7 0 0 1 14 0v2M18 12v6M15 15h6',
  report: 'M7 3h7l4 4v14H7V3ZM14 3v5h4M10 12h5M10 16h5',
  feeding: 'M12 3v18M8 3v6a4 4 0 0 0 8 0V3M5 21h14',
  device: 'M7 3h10v18H7V3ZM10 6h4M10 17h4M4 8v8M20 8v8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0'
};
</script>

<template>
  <aside class="desktop-sidebar">
    <RouterLink class="desktop-brand" to="/device" aria-label="Dr. Ferjoo">
      <DrFerjooMark />
    </RouterLink>
    <nav class="desktop-navigation" aria-label="主要导航">
      <RouterLink
        v-for="item in desktopNavItems"
        :key="item.to"
        :to="item.to"
        class="desktop-nav-link"
        :class="{ 'is-active': item.match(route.path) }"
        :aria-current="item.match(route.path) ? 'page' : undefined"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[item.icon]" /></svg>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
  <header class="desktop-topbar">
    <strong class="desktop-title">{{ title }}</strong>
    <RouterLink class="desktop-account" to="/me" :title="accountName">
      <span class="desktop-account-avatar"><img v-if="auth.profile.value?.avatar_url" :src="auth.profile.value.avatar_url" alt="" /><template v-else>{{ accountInitial }}</template></span>
      <span><strong>{{ accountName }}</strong><small v-if="!auth.user.value">尚未登录</small></span>
    </RouterLink>
  </header>
</template>
