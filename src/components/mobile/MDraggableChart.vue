<script setup>
import { computed } from 'vue';
import SeriesChart from '../SeriesChart.vue';

// 选点气泡直接显示原始读数时会出现 108.20189274447944% 这种长浮点。
// 这里统一收口：数值一律保留一位小数，非有限值给出占位符，避免 NaN%。
function tipValue(point) {
  const value = Number(point?.v);
  if (!Number.isFinite(value)) return '—';
  // 四舍五入后可能得到 -0.0，显示成 0.0 更符合直觉。
  const rounded = Math.round(value * 10) / 10 || 0;
  return rounded.toFixed(1);
}

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
  // 详情气泡固定在图表上方一行，只水平跟随竖线；所有移动端图表统一使用。
  fixedTip: { type: Boolean, default: true },
  sticky: { type: Boolean, default: true },
  caption: { type: String, default: '' },
  valueText: { type: String, default: '' }
});
const chartStyle = computed(() => ({ '--m-chart-height': `${props.height}px` }));
</script>

<template>
  <SeriesChart
    class="m-draggable-chart"
    :interactive="interactive"
    :bubble="bubble"
    :highlight="highlight"
    :fixed-tip="fixedTip"
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
      <strong>{{ tipValue(point) }}{{ unit }}</strong>
    </template>
  </SeriesChart>
</template>

<style scoped>
.m-draggable-chart { min-height: var(--m-chart-height, 126px); }
.m-draggable-chart :deep(.series-body svg) { height: var(--m-chart-height, 126px); }
.m-draggable-chart :deep(.series-hover-dot) { width: 11px; height: 11px; border: 0; border-radius: 50%; }
</style>
