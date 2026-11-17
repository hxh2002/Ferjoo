<script setup>
import '../assets/desktop.css';
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { classicAssets } from '../constants/classicAssets.js';
import { desktopNavGroups, desktopPageMeta } from '../lib/desktop-nav.js';

const route = useRoute();
const auth = useAuth();
onMounted(() => auth.init());

const meta = computed(() => desktopPageMeta(route.path));
const accountName = computed(() => auth.profile.value?.display_name || auth.profile.value?.system_user_id || auth.user.value?.email || '访客');
const accountInitial = computed(() => (accountName.value.trim().charAt(0) || 'F').toUpperCase());
const groups = computed(() => desktopNavGroups.map((group) => ({
  ...group,
  items: group.items.filter((item) => auth.user.value || !['/doctor/records', '/feeding', '/me/devices'].includes(item.to))
})));

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
  <div class="desktop-shell">
    <aside class="desktop-sidebar">
      <RouterLink class="desktop-brand" to="/device" aria-label="Dr. Ferjoo 设备首页">
        <img :src="classicAssets.logoBrand" alt="Dr. Ferjoo" />
        <span><strong>酵种医生</strong><small>发酵养护工作台</small></span>
      </RouterLink>

      <nav class="desktop-navigation" aria-label="桌面主导航">
        <section v-for="group in groups" :key="group.label" class="desktop-nav-group">
          <p>{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="desktop-nav-link"
            :class="{ 'is-active': item.match(route.path) }"
            :aria-current="item.match(route.path) ? 'page' : undefined"
          >
            <span class="desktop-nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[item.icon]" /></svg></span>
            <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
          </RouterLink>
        </section>
      </nav>

      <div class="desktop-sidebar-footer">
        <span class="desktop-sidebar-mark" aria-hidden="true">FJ</span>
        <p><strong>每一次变化，都有迹可循</strong><small>观察、记录，再慢慢理解你的酵种。</small></p>
      </div>
    </aside>

    <div class="desktop-workspace">
      <header class="desktop-topbar">
        <div class="desktop-breadcrumb">
          <small>{{ meta.parent }} <span>/</span> {{ meta.title }}</small>
          <strong>{{ meta.title }}</strong>
        </div>
        <div class="desktop-topbar-actions">
          <RouterLink v-if="route.path !== '/device'" class="desktop-quick-action" to="/device">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10" /></svg>
            实时状态
          </RouterLink>
          <RouterLink class="desktop-account" to="/me" :title="`个人中心 · ${accountName}`">
            <span class="desktop-account-avatar"><img v-if="auth.profile.value?.avatar_url" :src="auth.profile.value.avatar_url" alt="" /><template v-else>{{ accountInitial }}</template></span>
            <span><strong>{{ accountName }}</strong><small>{{ auth.user.value ? '个人中心与设置' : '登录后同步养护记录' }}</small></span>
          </RouterLink>
        </div>
      </header>
      <main class="desktop-main"><slot /></main>
    </div>
  </div>
</template>
