<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  color: { type: String, default: '#e85d16' },
  points: { type: Array, default: () => [] } // [{ t: ISO string, v: number }]
});

const W = 100;
const H = 44;
const PAD = 4;

const series = computed(() =>
  (props.points || [])
    .filter((p) => Number.isFinite(p?.v))
    .sort((a, b) => new Date(a.t) - new Date(b.t))
);

const stats = computed(() => {
  if (!series.value.length) return null;
  const values = series.value.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const last = values[values.length - 1];
  const lastAt = series.value[series.value.length - 1].t;
  return { min, max, last, lastAt };
});

const linePath = computed(() => {
  const pts = series.value;
  if (pts.length < 2 || !stats.value) return '';
  const { min, max } = stats.value;
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / (pts.length - 1);
  const toXY = (p, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - ((p.v - min) / span) * (H - PAD * 2);
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  };
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toXY(p, i).join(',')}`).join(' ');
});

const areaPath = computed(() => {
  if (!linePath.value) return '';
  return `${linePath.value} L${W - PAD},${H} L${PAD},${H} Z`;
});

const lastPoint = computed(() => {
  const pts = series.value;
  if (!pts.length || !stats.value) return null;
  const { min, max } = stats.value;
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / Math.max(pts.length - 1, 1);
  const last = pts[pts.length - 1];
  return {
    x: Number((PAD + (pts.length - 1) * stepX).toFixed(2)),
    y: Number((H - PAD - ((last.v - min) / span) * (H - PAD * 2)).toFixed(2))
  };
});

function fmt(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${props.unit}`;
}
</script>

<template>
  <div class="series-chart">
    <div class="series-head">
      <span class="series-label">{{ label }}</span>
      <strong class="series-value">{{ fmt(stats?.last) }}</strong>
    </div>
    <div v-if="series.length >= 2" class="series-body">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
        <path class="series-area" :d="areaPath" :style="{ fill: color }"></path>
        <path class="series-line" :d="linePath" :style="{ stroke: color }"></path>
        <circle
          v-if="lastPoint"
          class="series-dot"
          :cx="lastPoint.x"
          :cy="lastPoint.y"
          r="2"
          :style="{ fill: color }"
        ></circle>
      </svg>
      <div class="series-range">
        <span>min {{ fmt(stats?.min) }}</span>
        <span>max {{ fmt(stats?.max) }}</span>
      </div>
    </div>
    <div v-else class="series-empty">暂无可绘制的数据（需至少 2 个点）</div>
  </div>
</template>
