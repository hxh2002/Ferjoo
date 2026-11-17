<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { isWelcomeRoute } from './lib/site-entry.js';

// 只有 ferjoo.com 欢迎页脱离产品外壳；产品主体的所有路由共用同一个 MobileShell，宽窄屏交给 CSS。
const route = useRoute();
const isWelcome = computed(() => isWelcomeRoute(route));
</script>

<template>
  <RouterView v-if="isWelcome" />
  <div v-else class="mobile-area">
    <RouterView />
  </div>
</template>
