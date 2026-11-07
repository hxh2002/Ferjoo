<script setup>
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  description: { type: String, default: '' }
});
const emit = defineEmits(['close']);
const titleId = useId();
const descriptionId = useId();
const sheet = ref(null);
let previousFocus = null;
let previousOverflow = '';

const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

function trapFocus(event) {
  if (event.key === 'Escape') { emit('close'); return; }
  if (event.key !== 'Tab' || !sheet.value) return;
  const items = [...sheet.value.querySelectorAll(focusableSelector)];
  if (!items.length) { event.preventDefault(); sheet.value.focus(); return; }
  const first = items[0];
  const last = items.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet.value)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}

watch(() => props.open, async (open) => {
  if (typeof document === 'undefined') return;
  if (open) {
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    (sheet.value?.querySelector(focusableSelector) || sheet.value)?.focus();
  } else {
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus?.();
    previousFocus = null;
  }
});
onBeforeUnmount(() => {
  if (typeof document !== 'undefined' && props.open) document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="m-sheet">
      <div v-if="open" class="m-sheet-layer" @keydown="trapFocus">
        <button type="button" class="m-sheet-backdrop" aria-label="关闭弹层" tabindex="-1" @click="emit('close')" />
        <section
          ref="sheet"
          class="m-sheet"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
          tabindex="-1"
        >
          <div class="m-sheet-handle" aria-hidden="true" />
          <header class="m-sheet-header">
            <div>
              <h2 :id="titleId">{{ title }}</h2>
              <p v-if="description" :id="descriptionId">{{ description }}</p>
            </div>
            <button type="button" class="m-sheet-close" aria-label="关闭" @click="emit('close')">×</button>
          </header>
          <div class="m-sheet-body"><slot /></div>
          <div v-if="$slots.footer" class="m-sheet-footer"><slot name="footer" /></div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m-sheet-layer { position: fixed; inset: 0; z-index: var(--m-z-modal, 99); display: flex; align-items: flex-end; justify-content: center; }
.m-sheet-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: rgba(48,37,31,.25); cursor: default; }
.m-sheet { position: relative; width: min(100%, var(--m-page-max, 42rem)); max-height: 85vh; overflow: auto; padding: 8px var(--m-page-space, 24px) calc(24px + env(safe-area-inset-bottom)); border: 1px solid var(--border-warm); border-bottom: 0; border-radius: var(--m-radius-sheet) var(--m-radius-sheet) 0 0; background: var(--surface-page); color: var(--text-primary); }
.m-sheet :focus-visible, .m-sheet-close:focus-visible, .m-sheet-backdrop:focus-visible { outline: 2px solid var(--brand-action); outline-offset: 3px; }
.m-sheet-handle { width: 36px; height: 4px; margin: 0 auto 16px; border-radius: 2px; background: var(--border-input); }
.m-sheet-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.m-sheet-header h2 { margin: 0; font-size: var(--text-lg); line-height: 26px; font-weight: 500; }
.m-sheet-header p { margin: 6px 0 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 21px; }
.m-sheet-close { flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: var(--m-icon-disc); color: var(--text-primary); font-size: 24px; line-height: 1; cursor: pointer; }
.m-sheet-footer { margin-top: 20px; }
.m-sheet-enter-active, .m-sheet-leave-active { transition: opacity var(--motion-base) var(--ease-standard); }
.m-sheet-enter-active .m-sheet, .m-sheet-leave-active .m-sheet { transition: transform var(--motion-expand) var(--ease-expand); }
.m-sheet-enter-from, .m-sheet-leave-to { opacity: 0; }
.m-sheet-enter-from .m-sheet, .m-sheet-leave-to .m-sheet { transform: translateY(24px); }
@media (prefers-reduced-motion: reduce) {
  .m-sheet-enter-active, .m-sheet-leave-active, .m-sheet-enter-active .m-sheet, .m-sheet-leave-active .m-sheet { transition: none; }
}
</style>
