<script setup>
import AppHeader from './components/AppHeader.vue';
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="page-shell">
      <RouterView />
    </main>
    <footer class="app-footer">
      <span>Dr. Ferjoo · 仅供家庭烘焙参考</span>
      <span>生面粉与生酵种请勿试吃，充分烘烤后食用。</span>
    </footer>
  </div>
</template>
