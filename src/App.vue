<script setup>
import { computed, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import MobileShell from './components/MobileShell.vue';
import { classicAssets } from './constants/classicAssets.js';
import { isMobilePath, usesMobileAccountLayout } from './lib/accountNavigation.js';

const route = useRoute();
const router = useRouter();
const isMobileAccount = computed(() => usesMobileAccountLayout(route, router));
const isMobileArea = computed(() => isMobilePath(route.path) || isMobileAccount.value);
watchEffect(() => {
  document.documentElement.classList.toggle('mobile-mode', isMobileArea.value);
  document.body.classList.toggle('mobile-mode', isMobileArea.value);
});
</script>

<template>
  <div v-if="isMobileArea" class="mobile-area">
    <MobileShell v-if="isMobileAccount"><RouterView /></MobileShell>
    <RouterView v-else />
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
