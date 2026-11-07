<script setup>
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: '确认' },
  cancelLabel: { type: String, default: '取消' },
  danger: { type: Boolean, default: false }
});
const emit = defineEmits(['confirm', 'cancel']);
const titleId = useId();
const messageId = useId();
const dialog = ref(null);
let previousFocus = null;
let previousOverflow = '';

const focusableSelector = 'button:not(:disabled), [href], [tabindex="0"]';
function trapFocus(event) {
  if (event.key === 'Escape') { emit('cancel'); return; }
  if (event.key !== 'Tab' || !dialog.value) return;
  const items = [...dialog.value.querySelectorAll(focusableSelector)];
  const first = items[0];
  const last = items.at(-1);
  if (!first) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
watch(() => props.open, async (open) => {
  if (typeof document === 'undefined') return;
  if (open) {
    previousFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    await nextTick();
    dialog.value?.querySelector(props.danger ? '.m-confirm-cancel' : '.m-confirm-accept')?.focus();
  } else {
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus?.();
  }
});
onBeforeUnmount(() => {
  if (typeof document !== 'undefined' && props.open) document.body.style.overflow = previousOverflow;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="m-confirm">
      <div v-if="open" class="m-confirm-layer" @keydown="trapFocus">
        <button type="button" class="m-confirm-backdrop" aria-label="取消" tabindex="-1" @click="emit('cancel')" />
        <section
          ref="dialog"
          class="m-confirm"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="message ? messageId : undefined"
        >
          <h2 :id="titleId">{{ title }}</h2>
          <p v-if="message" :id="messageId">{{ message }}</p>
          <div class="m-confirm-actions">
            <button type="button" class="m-confirm-cancel" @click="emit('cancel')">{{ cancelLabel }}</button>
            <button type="button" class="m-confirm-accept" :class="{ 'is-danger': danger }" @click="emit('confirm')">{{ confirmLabel }}</button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m-confirm-layer { position: fixed; inset: 0; z-index: var(--m-z-modal, 99); display: grid; place-items: center; padding: 24px; }
.m-confirm-backdrop { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: rgba(48, 37, 31, .25); }
.m-confirm { position: relative; width: min(327px, 100%); padding: 24px; border: 1px solid var(--border-warm); border-radius: var(--m-radius-sheet); background: var(--surface-card); color: var(--text-primary); box-shadow: var(--m-shadow); }
.m-confirm h2 { margin: 0; font-size: var(--m-text-confirm); line-height: 28px; font-weight: 500; }
.m-confirm p { margin: 8px 0 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 21px; }
.m-confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
.m-confirm-actions button { min-height: 44px; padding: 0 12px; border-radius: var(--m-radius-confirm); font: inherit; font-size: var(--text-md); font-weight: 500; cursor: pointer; }
.m-confirm :focus-visible, .m-confirm-backdrop:focus-visible { outline: 2px solid var(--brand-action); outline-offset: 3px; }
.m-confirm-cancel { border: 1px solid var(--border-warm); background: var(--surface-card); color: var(--text-primary); }
.m-confirm-accept { border: 0; background: var(--brand-light); color: var(--text-primary); }
.m-confirm-accept.is-danger { background: var(--danger-bg); color: var(--danger-text); }
.m-confirm-enter-active, .m-confirm-leave-active { transition: opacity var(--motion-base) var(--ease-standard); }
.m-confirm-enter-from, .m-confirm-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .m-confirm-enter-active, .m-confirm-leave-active { transition: none; }
}
</style>
