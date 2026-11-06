<script setup>
defineProps({
  size: { type: [Number, String], default: 36 },
  iconSize: { type: [Number, String], default: 20 },
  label: { type: String, default: '' }
});
</script>

<template>
  <span
    class="m-icon-disc"
    :class="{ 'm-icon-disc-decorative': !label }"
    role="img"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    :style="{ '--m-icon-disc-size': `${size}px`, '--m-icon-size': `${iconSize}px` }"
  >
    <slot />
  </span>
</template>

<style scoped>
.m-icon-disc {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--m-icon-disc-size);
  height: var(--m-icon-disc-size);
  border-radius: 50%;
  background: var(--m-icon-disc);
  color: var(--brand-action);
}
.m-icon-disc :deep(svg) {
  width: var(--m-icon-size);
  height: var(--m-icon-size);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.m-icon-disc :deep(img) { width: var(--m-icon-size); height: var(--m-icon-size); object-fit: contain; }
</style>
