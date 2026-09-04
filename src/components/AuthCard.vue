<script setup>
defineProps({
  eyebrow: { type: String, default: 'DR. FERJOO ACCOUNT' },
  title: { type: String, required: true },
  description: { type: String, default: '' }
});
</script>

<template>
  <section class="panel auth-card">
    <p class="eyebrow dark">{{ eyebrow }}</p>
    <h1>{{ title }}</h1>
    <p class="auth-description">{{ description }}</p>
    <slot />
  </section>
</template>
