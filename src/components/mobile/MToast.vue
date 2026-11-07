<script setup>
import { onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  message: { type: String, default: '' },
  tone: { type: String, default: 'success', validator: (value) => ['success', 'error', 'neutral'].includes(value) },
  duration: { type: Number, default: 2600 }
});
const emit = defineEmits(['close']);
let timer = 0;

watch(() => [props.open, props.message, props.tone], () => {
  clearTimeout(timer);
  if (props.open) timer = setTimeout(() => emit('close'), props.duration);
}, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <Teleport to="body">
    <Transition name="m-toast">
      <p v-if="open && message" class="m-toast" :class="`is-${tone}`" role="status">{{ message }}</p>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m-toast { position: fixed; z-index: var(--m-z-modal, 99); top: calc(24px + env(safe-area-inset-top)); left: 50%; width: min(280px, calc(100% - 48px)); margin: 0; padding: 14px 16px; border: 1px solid var(--border-warm); border-radius: var(--m-radius-toast); background: var(--surface-card); color: var(--text-primary); font-size: var(--text-sm); line-height: 21px; text-align: center; box-shadow: var(--m-shadow); }
.m-toast:focus-visible { outline: 2px solid var(--brand-action); outline-offset: 3px; }
.m-toast.is-success { background: var(--success-bg); color: var(--success-text); }
.m-toast.is-error { background: var(--danger-bg); color: var(--danger-text); }
.m-toast.is-neutral { background: var(--surface-card); color: var(--text-secondary); }
.m-toast-enter-active, .m-toast-leave-active { transition: opacity var(--motion-base) var(--ease-standard), transform var(--motion-base) var(--ease-standard); }
.m-toast-enter-from, .m-toast-leave-to { opacity: 0; transform: translate(-50%, 8px); }
.m-toast-enter-to, .m-toast-leave-from { transform: translateX(-50%); }
@media (prefers-reduced-motion: reduce) {
  .m-toast-enter-active, .m-toast-leave-active { transition: none; }
}
</style>
