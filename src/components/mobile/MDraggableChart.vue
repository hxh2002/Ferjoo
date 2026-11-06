<script setup>
import { ref } from 'vue';
import SeriesChart from '../SeriesChart.vue';

defineProps({
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  color: { type: String, default: 'var(--brand-action)' },
  points: { type: Array, default: () => [] },
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  bubbleTitle: { type: String, default: '' }
});
const selected = ref(null);

function caption(point) {
  if (!point?.t) return '';
  const date = new Date(point.t);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>

<template>
  <SeriesChart
    class="m-draggable-chart"
    sticky
    :label="label"
    :unit="unit"
    :color="color"
    :points="points"
    :from="from"
    :to="to"
    @select="selected = $event"
  >
    <template #tip="{ point }">
      <span>{{ bubbleTitle || caption(point) }}</span>
      <strong>{{ point.v }}{{ unit }}</strong>
    </template>
  </SeriesChart>
  <p v-if="selected" class="m-draggable-current">当前 {{ selected.v }}{{ unit }}</p>
</template>

<style scoped>
.m-draggable-chart { min-height: 126px; }
.m-draggable-chart :deep(.series-tip) { width: 104px; min-height: 38px; border: 1px solid var(--border-warm); border-radius: 8px; background: var(--surface-card); }
.m-draggable-chart :deep(.series-hover-dot) { width: 11px; height: 11px; border-radius: 50%; }
.m-draggable-current { margin: 8px 0 0; color: var(--text-secondary); font-size: var(--text-xs); line-height: 18px; text-align: right; }
</style>
