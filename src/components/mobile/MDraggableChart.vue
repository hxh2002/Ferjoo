<script setup>
import { computed } from 'vue';
import SeriesChart from '../SeriesChart.vue';

// 选点气泡统一收口，避免原始浮点和 NaN 直接进入界面；膨胀倍数使用两位小数。
function tipValue(point) {
  const value = Number(point?.v);
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** props.digits;
  // 四舍五入后可能得到 -0.0，显示成 0 更符合直觉。
  const rounded = Math.round(value * factor) / factor || 0;
  return rounded.toFixed(props.digits);
}

const props = defineProps({
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  digits: { type: Number, default: 1 },
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
  // 初次有数据即选中最早的有效点，拖动 / 键盘操作后保留最后选点。
  sticky: { type: Boolean, default: true },
  initialSelection: { type: String, default: 'oldest' },
  caption: { type: String, default: '' },
  valueText: { type: String, default: '' },
  nowLabel: { type: String, default: '当前' }
});
const announceValue = (point) => `${tipValue(point)}${props.unit}`;
const chartStyle = computed(() => ({ '--m-chart-height': `${props.height}px` }));
// 标题值与 min/max 标签和气泡共用同一精度，避免同一张卡上出现 1.4 / 1.42、100% / 100.0% 并存。
const finite = computed(() => (props.points || [])
  .filter((point) => Number.isFinite(point?.v) && Number.isFinite(Date.parse(point?.t)))
  .slice().sort((a, b) => Date.parse(a.t) - Date.parse(b.t)));
function valueLabel(value) {
  return finite.value.length ? `${tipValue({ v: value })}${props.unit}` : '';
}
const minText = computed(() => valueLabel(Math.min(...finite.value.map((point) => point.v))));
const maxText = computed(() => valueLabel(Math.max(...finite.value.map((point) => point.v))));
const headText = computed(() => props.valueText || valueLabel(finite.value.at(-1)?.v));
</script>

<template>
  <SeriesChart
    class="m-draggable-chart"
    :interactive="interactive"
    :bubble="bubble"
    :highlight="highlight"
    :fixed-tip="fixedTip"
    :sticky="sticky"
    :initial-selection="initialSelection"
    :style="chartStyle"
    :label="label"
    :unit="unit"
    :color="color"
    :points="points"
    :from="from"
    :to="to"
    :caption="caption"
    :value-text="headText"
    :min-text="minText"
    :max-text="maxText"
    :now-label="nowLabel"
    :announce-value="announceValue"
  >
    <template #tip="{ point, timeText }">
      <span>{{ timeText }}</span>
      <strong>{{ tipValue(point) }}{{ unit }}</strong>
    </template>
  </SeriesChart>
</template>

<style scoped>
.m-draggable-chart { min-height: var(--m-chart-height, 126px); --series-guide-color: var(--text-secondary, #75665b); --series-guide-width: 1px; }
.m-draggable-chart :deep(.series-body svg) { height: var(--m-chart-height, 126px); }
.m-draggable-chart :deep(.series-hover-dot) { width: 9px; height: 9px; border: 2px solid var(--surface-card, #fff); border-radius: 50%; box-sizing: border-box; box-shadow: 0 0 0 1px var(--m-chart-line, rgba(42, 29, 23, .12)); }
</style>
