<script setup>
import { computed } from 'vue';
import SeriesChart from '../SeriesChart.vue';

const props = defineProps({
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  color: { type: String, default: 'var(--brand-action)' },
  points: { type: Array, default: () => [] },
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  height: { type: Number, default: 126 },
  interactive: { type: Boolean, default: true },
  bubble: { type: Boolean, default: true },
  highlight: { type: Boolean, default: true },
  sticky: { type: Boolean, default: true },
  caption: { type: String, default: '' },
  valueText: { type: String, default: '' }
});
const chartStyle = computed(() => ({ '--m-chart-height': `${props.height}px` }));

function elapsedCaption(point) {
  if (!point?.t) return '';
  const time = Date.parse(point.t);
  const start = Date.parse(props.from);
  if (!Number.isFinite(time)) return '';
  if (Number.isFinite(start) && time >= start) {
    const hours = Math.max(0, Math.round((time - start) / 3600000));
    return `发酵 ${hours} 小时`;
  }
  const date = new Date(time);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>

<template>
  <SeriesChart
    class="m-draggable-chart"
    :interactive="interactive"
    :bubble="bubble"
    :highlight="highlight"
    :sticky="sticky"
    :style="chartStyle"
    :label="label"
    :unit="unit"
    :color="color"
    :points="points"
    :from="from"
    :to="to"
    :caption="caption"
    :value-text="valueText"
  >
    <template #tip="{ point }">
      <span>{{ elapsedCaption(point) }}</span>
      <strong>{{ point.v }}{{ unit }}</strong>
    </template>
  </SeriesChart>
</template>

<style scoped>
.m-draggable-chart { min-height: var(--m-chart-height, 126px); }
.m-draggable-chart :deep(.series-body svg) { height: var(--m-chart-height, 126px); }
.m-draggable-chart :deep(.series-tip) { width: 104px; min-height: 38px; padding: 4px 8px; border: 1px solid var(--border-warm); border-radius: var(--m-radius-bubble); background: var(--surface-card); color: var(--text-primary); box-shadow: var(--m-shadow); white-space: normal; }
.m-draggable-chart :deep(.series-tip span) { display: block; color: var(--text-secondary); font-size: var(--text-xs); line-height: 18px; opacity: 1; white-space: normal; }
.m-draggable-chart :deep(.series-tip strong) { color: var(--text-primary); font-size: var(--text-md); font-weight: 500; line-height: 24px; white-space: normal; }
.m-draggable-chart :deep(.series-hover-dot) { width: 11px; height: 11px; border: 0; border-radius: 50%; }
</style>
