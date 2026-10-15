<script setup>
import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import { classicAssets } from './constants/classicAssets.js';

const route = useRoute();
const isMobileArea = computed(() => route.path.startsWith('/today') || route.path.startsWith('/records') || route.path.startsWith('/checkin') || route.path.startsWith('/feeding') || route.path.startsWith('/reports') || route.path.startsWith('/devices') || route.path.startsWith('/me'));
watchEffect(() => {
  document.documentElement.classList.toggle('mobile-mode', isMobileArea.value);
  document.body.classList.toggle('mobile-mode', isMobileArea.value);
});
</script>

<template>
  <div v-if="isMobileArea" class="mobile-area">
    <RouterView />
  </div>
  <div v-else class="page-shell">
    <AppHeader />
    <main>
      <RouterView />
    </main>
    <footer class="site-footer">
      <img :src="classicAssets.logoEnglish" alt="Dr. Ferjoo" />
      <p>Powered by Ferjoo</p>
    </footer>
  </div>
</template>
