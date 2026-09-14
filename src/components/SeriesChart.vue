<script setup>
import { computed, ref, useId } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  color: { type: String, default: '#e85d16' },
  points: { type: Array, default: () => [] } // [{ t: ISO string, v: number }]
});

const W = 100;
const H = 44;
const PAD_X = 5;
const PAD_Y = 6;

const gid = useId();
const gridYs = [H * 0.25, H * 0.5, H * 0.75];

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
  const delta = last - values[0];
  return {
    min,
    max,
    last,
    delta,
    firstAt: series.value[0].t,
    lastAt: series.value[series.value.length - 1].t
  };
});

const coords = computed(() => {
  const pts = series.value;
  if (!pts.length || !stats.value) return [];
  const { min, max } = stats.value;
  const span = max - min;
  const stepX = pts.length > 1 ? (W - PAD_X * 2) / (pts.length - 1) : 0;
  return pts.map((p, i) => ({
    x: round(pts.length > 1 ? PAD_X + i * stepX : W / 2),
    y: round(span === 0 ? H / 2 : H - PAD_Y - ((p.v - min) / span) * (H - PAD_Y * 2)),
    t: p.t,
    v: p.v
  }));
});

function round(n) {
  return Number(n.toFixed(2));
}

// Catmull-Rom 转三次贝塞尔，折线变平滑曲线
function smoothPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = round(p1.x + (p2.x - p0.x) / 6);
    const c1y = round(p1.y + (p2.y - p0.y) / 6);
    const c2x = round(p2.x - (p3.x - p1.x) / 6);
    const c2y = round(p2.y - (p3.y - p1.y) / 6);
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

const linePath = computed(() => smoothPath(coords.value));
const areaPath = computed(() => {
  const pts = coords.value;
  if (!linePath.value || !pts.length) return '';
  return `${linePath.value} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;
});

const lastPoint = computed(() => coords.value[coords.value.length - 1] || null);

const hoverIdx = ref(null);
const hoverPoint = computed(() => (hoverIdx.value == null ? null : coords.value[hoverIdx.value]));

// 靠近边缘时调整 tooltip 位置，避免溢出卡片
const tipStyle = computed(() => {
  const p = hoverPoint.value;
  if (!p) return {};
  const fx = p.x / W;
  const fy = p.y / H;
  const tx = fx < 0.14 ? '-12%' : fx > 0.86 ? '-88%' : '-50%';
  const ty = fy < 0.32 ? '10px' : 'calc(-100% - 8px)';
  return { left: `${fx * 100}%`, top: `${fy * 100}%`, transform: `translate(${tx}, ${ty})` };
});

function onMove(e) {
  const pts = coords.value;
  if (!pts.length) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const fx = ((e.clientX - rect.left) / rect.width) * W;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(pts[i].x - fx);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  hoverIdx.value = best;
}

function clearHover() {
  hoverIdx.value = null;
}

const deltaText = computed(() => {
  if (!stats.value) return '';
  const abs = Math.round(Math.abs(stats.value.delta) * 10) / 10;
  if (abs === 0) return '±0';
  return `${stats.value.delta > 0 ? '▲' : '▼'} ${abs}${props.unit}`;
});
const deltaClass = computed(() => {
  if (!stats.value || stats.value.delta === 0) return 'flat';
  return stats.value.delta > 0 ? 'up' : 'down';
});

function fmt(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${props.unit}`;
}

function fmtTime(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<template>
  <div class="series-chart">
    <div class="series-head">
      <span class="series-label">{{ label }}</span>
      <div class="series-headline">
        <span v-if="stats" class="series-delta" :class="deltaClass">{{ deltaText }}</span>
        <strong class="series-value">{{ fmt(stats?.last) }}</strong>
      </div>
    </div>
    <div v-if="series.length" class="series-body">
      <div class="series-plot" @pointermove="onMove" @pointerleave="clearHover">
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="color" stop-opacity=".30" />
              <stop offset="100%" :stop-color="color" stop-opacity="0" />
            </linearGradient>
          </defs>
          <line
            v-for="y in gridYs"
            :key="y"
            class="series-grid"
            :x1="PAD_X"
            :x2="W - PAD_X"
            :y1="y"
            :y2="y"
          />
          <path v-if="areaPath" class="series-area" :d="areaPath" :fill="`url(#${gid})`" />
          <path
            v-if="linePath"
            class="series-line"
            :d="linePath"
            :style="{ stroke: color }"
            pathLength="100"
          />
          <line
            v-if="hoverPoint"
            class="series-guide"
            :x1="hoverPoint.x"
            :x2="hoverPoint.x"
            :y1="0"
            :y2="H"
          />
          <circle
            v-if="hoverPoint"
            class="series-hover-dot"
            :cx="hoverPoint.x"
            :cy="hoverPoint.y"
            r="2.6"
            :style="{ fill: color }"
          />
          <circle
            v-else-if="lastPoint"
            class="series-dot"
            :cx="lastPoint.x"
            :cy="lastPoint.y"
            r="2"
            :style="{ fill: color }"
          />
        </svg>
        <div
          v-if="hoverPoint"
          class="series-tip"
          :style="tipStyle"
        >
          <strong>{{ fmt(hoverPoint.v) }}</strong>
          <span>{{ fmtTime(hoverPoint.t) }}</span>
        </div>
      </div>
      <div class="series-range">
        <span>min {{ fmt(stats?.min) }}</span>
        <span class="series-span">{{ fmtTime(stats?.firstAt) }} – {{ fmtTime(stats?.lastAt) }}</span>
        <span>max {{ fmt(stats?.max) }}</span>
      </div>
    </div>
    <div v-else class="series-empty">暂无可绘制的数据</div>
  </div>
</template>
