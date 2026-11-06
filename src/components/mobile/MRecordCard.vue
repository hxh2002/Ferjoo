<script setup>
import MIconDisc from './MIconDisc.vue';

defineProps({
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  open: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  icon: { type: String, default: 'clock' },
  contentId: { type: String, required: true }
});
const emit = defineEmits(['toggle']);

// 图标只负责识别，不作为单独点击目标；整张标题行始终是可展开按钮。
const paths = {
  clock: 'M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  scales: 'M7 4v16M17 4v16M4 8h16M6 8l-3 6h6l-3-6M18 8l-3 6h6l-3-6',
  chart: 'M4 19V5M4 19h16M7 15l4-5 3 2 5-7',
  calendar: 'M6 3v3M18 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1',
  alert: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'
};
</script>

<template>
  <section class="m-record-card" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <button
      type="button"
      class="m-record-card-toggle"
      :aria-expanded="open"
      :aria-controls="contentId"
      :disabled="disabled"
      @click="emit('toggle')"
    >
      <MIconDisc :size="36" :icon-size="20">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="paths[icon] || paths.clock" /></svg>
      </MIconDisc>
      <span class="m-record-card-title">{{ title }}</span>
      <span v-if="summary" class="m-record-card-summary">{{ summary }}</span>
      <svg class="m-record-card-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <div class="m-record-card-panel" :class="{ 'is-open': open }">
      <div :id="contentId" class="m-record-card-body">
        <div class="m-record-card-inner">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.m-record-card { overflow: hidden; border: 1px solid var(--border-warm); border-radius: var(--radius-card); background: var(--surface-card); box-shadow: var(--m-shadow); }
.m-record-card-toggle { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 64px; padding: 14px 16px; border: 0; background: transparent; text-align: left; cursor: pointer; }
.m-record-card-title { flex: none; color: var(--text-primary); font-size: var(--text-sm); font-weight: 500; line-height: 21px; }
.m-record-card-summary { flex: 1; min-width: 0; color: var(--text-secondary); font-size: var(--text-sm); line-height: 21px; text-align: right; }
.m-record-card-chevron { flex: none; width: 18px; height: 18px; fill: none; stroke: var(--text-secondary); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transition: transform var(--motion-expand) cubic-bezier(.22,.8,.24,1); }
.is-open .m-record-card-chevron { transform: rotate(180deg); }
.m-record-card-panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--motion-expand) cubic-bezier(.22,.8,.24,1); }
.m-record-card-panel.is-open { grid-template-rows: 1fr; }
.m-record-card-body { overflow: hidden; min-height: 0; }
.m-record-card-inner { padding: 0 16px 16px; border-top: 1px solid var(--border-warm); }
.is-disabled .m-record-card-summary { opacity: .55; }
@media (prefers-reduced-motion: reduce) {
  .m-record-card-chevron, .m-record-card-panel { transition: none; }
}
</style>
