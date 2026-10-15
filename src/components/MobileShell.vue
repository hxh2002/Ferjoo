<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { classicAssets } from '../constants/classicAssets.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const tabs = [
  { path: '/today', label: '今天', icon: '○' },
  { path: '/records', label: '记录', icon: '▤' },
  { path: '/me', label: '我的', icon: '◇' }
];
const isTask = computed(() => ['/checkin', '/feeding', '/reports', '/me/devices', '/devices'].some((path) => route.path.startsWith(path)));
const showTabs = computed(() => !isTask.value && !['/login', '/register'].includes(route.path));
onMounted(() => auth.init());
function go(path) { router.push(path); }
</script>

<template>
  <div class="mobile-shell">
    <header class="mobile-topbar">
      <RouterLink class="mobile-brand" to="/today" aria-label="Ferjoo 今天"><img :src="classicAssets.logoBrand" alt="Ferjoo" /></RouterLink>
      <RouterLink v-if="!auth.user.value" class="mobile-login" :to="{ path: '/login', query: { redirect: route.fullPath } }">登录</RouterLink>
      <span v-else class="mobile-account">{{ auth.profile.value?.display_name || auth.user.value.email }}</span>
    </header>
    <main class="mobile-main"><RouterView /></main>
    <nav v-if="showTabs" class="mobile-tabbar" aria-label="主要导航">
      <button v-for="tab in tabs" :key="tab.path" type="button" :class="{ active: route.path === tab.path }" @click="go(tab.path)"><span aria-hidden="true">{{ tab.icon }}</span><strong>{{ tab.label }}</strong></button>
    </nav>
  </div>
</template>
