<script setup>
import '../../assets/admin.css';
import { useRoute } from 'vue-router';
import { adminNavItems } from '../../lib/desktop-nav.js';

const route = useRoute();
</script>

<template>
  <div class="admin-console">
    <nav class="admin-subnav" aria-label="后台">
      <RouterLink to="/device">返回</RouterLink>
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
