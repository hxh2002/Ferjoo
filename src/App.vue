<script setup>
import AppHeader from './components/AppHeader.vue';
import { classicAssets } from './constants/classicAssets.js';
</script>

<template>
  <div class="page-shell">
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
