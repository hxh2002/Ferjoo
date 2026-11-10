<script setup>
import { computed, onBeforeUnmount, watch } from 'vue';
import { claimToastSlot } from './toast-slot.js';

// 全局统一的提示弹窗（样式取自设备首页「历史记录已保存」）：
// 标题（message）+ 可选副标题（subtitle）+ 随类型变化的圆形图标；同一时刻全局只显示一条。
const props = defineProps({
  open: { type: Boolean, default: false },
  message: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  tone: { type: String, default: 'success', validator: (value) => ['success', 'info', 'neutral', 'warning', 'error'].includes(value) },
  duration: { type: Number, default: 2600 }
});
const emit = defineEmits(['close']);
let timer = 0;
let releaseSlot = null;

const kind = computed(() => (props.tone === 'neutral' ? 'info' : props.tone));
const iconPath = computed(() => ({
  success: 'm5 12.5 4.5 4.5L19 7.5',
  info: 'M12 11v5.5M12 7.5v.01',
  warning: 'M12 6.5v6.5M12 17v.01',
  error: 'M7.5 7.5l9 9M16.5 7.5l-9 9'
}[kind.value]));

function stop() {
  clearTimeout(timer);
  if (releaseSlot) { releaseSlot(); releaseSlot = null; }
}
watch(() => [props.open, props.message, props.subtitle, props.tone], () => {
  clearTimeout(timer);
  if (props.open && props.message) {
    if (!releaseSlot) releaseSlot = claimToastSlot(() => emit('close'));
    timer = setTimeout(() => emit('close'), props.duration);
  } else stop();
}, { immediate: true });
onBeforeUnmount(stop);
</script>

<template>
  <Teleport to="body">
    <Transition name="m-toast">
      <div v-if="open && message" class="m-toast" :class="`is-${kind}`" :role="kind === 'error' || kind === 'warning' ? 'alert' : 'status'">
        <span class="m-toast-disc" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path :d="iconPath" /></svg></span>
        <span class="m-toast-copy"><strong>{{ message }}</strong><small v-if="subtitle">{{ subtitle }}</small></span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m-toast { position: fixed; z-index: var(--m-z-modal, 99); top: calc(env(safe-area-inset-top) + 87px); left: 50%; display: flex; align-items: center; gap: 12px; width: min(280px, calc(100% - 48px - env(safe-area-inset-left) - env(safe-area-inset-right))); max-width: calc(100vw - 48px - env(safe-area-inset-left) - env(safe-area-inset-right)); min-height: 68px; box-sizing: border-box; transform: translateX(-50%); margin: 0; padding: 13px; border: 1px solid var(--brand-light); border-radius: var(--m-radius-toast); background: var(--surface-card); color: var(--text-primary); box-shadow: 0 5px 18px rgba(48, 37, 31, .14); }
.m-toast:focus-visible { outline: 2px solid var(--brand-action); outline-offset: 3px; }
.m-toast-disc { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 50%; background: rgba(255, 176, 90, .16); color: var(--brand-action); }
.m-toast-disc svg { width: 20px; height: 20px; }
.m-toast.is-info .m-toast-disc { background: var(--info-bg); color: var(--info-text); }
.m-toast.is-warning .m-toast-disc { background: var(--warning-bg); color: var(--warning-text); }
.m-toast.is-error .m-toast-disc { background: var(--danger-bg); color: var(--danger-text); }
.m-toast-copy { display: grid; gap: 2px; min-width: 0; }
.m-toast-copy strong { font-size: 16px; line-height: 20px; font-weight: 500; color: var(--text-primary); overflow-wrap: anywhere; }
.m-toast-copy small { font-size: 12px; line-height: 18px; color: var(--text-secondary); overflow-wrap: anywhere; }
.m-toast-enter-active, .m-toast-leave-active { transition: opacity var(--motion-base) var(--ease-standard), transform var(--motion-base) var(--ease-standard); }
.m-toast-enter-from, .m-toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }
.m-toast-enter-to, .m-toast-leave-from { transform: translateX(-50%); }
@media (prefers-reduced-motion: reduce) {
  .m-toast-enter-active, .m-toast-leave-active { transition: none; }
}
</style>
