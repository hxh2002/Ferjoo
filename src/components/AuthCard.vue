<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
});
</script>

<template>
  <section class="auth-card panel">
    <p class="eyebrow">Account</p>
    <h1>{{ title }}</h1>
    <p class="muted">{{ subtitle }}</p>
    <slot />
  </section>
</template>
