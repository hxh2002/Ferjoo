<script setup>
import '../../assets/admin.css';
import { useRoute } from 'vue-router';
import { adminNavItems } from '../../lib/desktop-nav.js';

// 桌面分区在侧栏里。这行链接只给窄屏用，返回仍由外壳的顶栏或侧栏承担。
const route = useRoute();
</script>

<template>
  <div class="admin-console">
    <nav class="admin-sections" aria-label="后台分区">
      <RouterLink
        v-for="item in adminNavItems"
        :key="item.to"
        :to="item.to"
        :class="{ 'is-active': item.match(route.path) }"
        :aria-current="item.match(route.path) ? 'page' : undefined"
      >{{ item.label }}</RouterLink>
    </nav>
    <RouterView />
  </div>
</template>
