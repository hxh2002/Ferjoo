<script setup>
import '../assets/desktop.css';
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { adminNavItems, desktopNavItems } from '../lib/desktop-nav.js';
import DrFerjooMark from './DrFerjooMark.vue';

// 宽屏侧栏与顶栏。它和手机顶栏、底部标签同时存在于 DOM，是否可见只由 desktop.css 的 768px 断点决定；
// 账号、路由和页面数据都复用 MobileShell 与页面本身的状态。
defineProps({ title: { type: String, default: '' } });
const route = useRoute();
const auth = useAuth();
onMounted(() => auth.init());

const accountName = computed(() => auth.profile.value?.display_name || auth.profile.value?.system_user_id || auth.user.value?.email || '我的');
const accountInitial = computed(() => accountName.value.trim().slice(0, 1).toUpperCase() || '我');
const isAdmin = computed(() => auth.profile.value?.role === 'A');
const inAdmin = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'));
const navItems = computed(() => (inAdmin.value ? adminNavItems : desktopNavItems));
const accountRole = computed(() => (auth.profile.value?.is_super_admin ? '首位管理员' : isAdmin.value ? '管理员' : ''));

const paths = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6',
  calendar: 'M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1M8 12h2M14 12h2M8 16h2M14 16h2',
  doctor: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM5 21v-2a7 7 0 0 1 14 0v2M18 12v6M15 15h6',
  report: 'M7 3h7l4 4v14H7V3ZM14 3v5h4M10 12h5M10 16h5',
  feeding: 'M12 3v18M8 3v6a4 4 0 0 0 8 0V3M5 21h14',
  device: 'M7 3h10v18H7V3ZM10 6h4M10 17h4M4 8v8M20 8v8',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  overview: 'M4 4h7v7H4V4ZM13 4h7v7h-7V4ZM4 13h7v7H4v-7ZM13 13h7v7h-7v-7',
  link: 'M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7-7l-1.3 1.3M14 11a5 5 0 0 0-7.1-.1L5.5 12.3a5 5 0 0 0 7 7L14 18',
  rounds: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  care: 'M8 4h8v16H8V4ZM10 8h4M10 12h4M10 16h3',
  analytics: 'M4 19V5M4 19h16M8 15v4M12 10v9M16 6v13',
  admin: 'M12 3 5 6v6c0 4.2 2.8 7.2 7 8 4.2-.8 7-3.8 7-8V6l-7-3Z',
  back: 'M15 6 9 12l6 6'
};
</script>

<template>
  <aside class="desktop-sidebar">
    <RouterLink class="desktop-brand" to="/device" aria-label="Dr. Ferjoo">
      <DrFerjooMark plain />
    </RouterLink>
    <nav class="desktop-navigation" aria-label="主要导航">
      <RouterLink v-if="inAdmin" class="desktop-nav-link desktop-nav-back" to="/device">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths.back" /></svg>
        <span>返回</span>
      </RouterLink>
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="desktop-nav-link"
        :class="{ 'is-active': item.match(route.path) }"
        :aria-current="item.match(route.path) ? 'page' : undefined"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[item.icon]" /></svg>
        <span>{{ item.label }}</span>
      </RouterLink>
      <div v-if="isAdmin && !inAdmin" class="desktop-nav-admin">
        <RouterLink class="desktop-nav-link" to="/admin" :class="{ 'is-active': inAdmin }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths.admin" /></svg>
          <span>后台</span>
        </RouterLink>
      </div>
    </nav>
  </aside>
  <header class="desktop-topbar">
    <strong class="desktop-title">{{ title }}</strong>
    <RouterLink class="desktop-account" to="/me" :title="accountName">
      <span class="desktop-account-avatar"><img v-if="auth.profile.value?.avatar_url" :src="auth.profile.value.avatar_url" alt="" /><template v-else>{{ accountInitial }}</template></span>
      <span><strong>{{ accountName }}</strong><small v-if="!auth.user.value">尚未登录</small><small v-else-if="accountRole">{{ accountRole }}</small></span>
    </RouterLink>
  </header>
</template>
