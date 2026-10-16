<script setup>
import { computed, ref, useId, watch } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  color: { type: String, default: '#C04B0A' },
  baseline: { type: Number, default: null },
  points: { type: Array, default: () => [] } // [{ t: ISO string, v: number }]
});

const W = 100;
const H = 44;
const PAD_X = 5;
const PAD_Y = 6;

const gid = useId();
const gridYs = [H * 0.25, H * 0.5, H * 0.75];

const samples = computed(() => (props.points || [])
  .filter((p) => Number.isFinite(Date.parse(p?.t)))
  .slice().sort((a, b) => new Date(a.t) - new Date(b.t)));
const series = computed(() => samples.value.filter((p) => Number.isFinite(p?.v) && !p.sensor_error));

const baselineValue = computed(() => (Number.isFinite(props.baseline) ? props.baseline : null));

const stats = computed(() => {
  if (!series.value.length) return null;
  const values = series.value.map((p) => p.v);
  const bounds = baselineValue.value == null ? values : [...values, baselineValue.value];
  const min = Math.min(...bounds);
  const max = Math.max(...bounds);
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
  const tMin = new Date(pts[0].t).getTime();
  const tMax = new Date(pts.at(-1).t).getTime();
  const tSpan = Math.max(tMax - tMin, 1);
  return pts.map((p) => ({
    x: round(pts.length > 1 ? PAD_X + ((new Date(p.t).getTime() - tMin) / tSpan) * (W - PAD_X * 2) : W / 2),
    y: round(span === 0 ? H / 2 : H - PAD_Y - ((p.v - min) / span) * (H - PAD_Y * 2)),
    t: p.t,
    v: p.v
  }));
});

function round(n) {
  return Number(n.toFixed(2));
}

function linePathFor(pts) {
  if (pts.length < 2) return '';
  return `M${pts.map((p) => `${p.x},${p.y}`).join(' L')}`;
}

const segments = computed(() => {
  const result = [];
  let segment = [];
  let previous = null;
  let index = 0;
  for (const sample of samples.value) {
    if (!Number.isFinite(sample.v) || sample.sensor_error) {
      if (segment.length) result.push(segment);
      segment = [];
      previous = null;
      continue;
    }
    if (previous && Date.parse(sample.t) - Date.parse(previous.t) > 40 * 60 * 1000) {
      result.push(segment);
      segment = [];
    }
    segment.push(coords.value[index++]);
    previous = sample;
  }
  if (segment.length) result.push(segment);
  return result;
});
const linePath = computed(() => segments.value.map(linePathFor).join(' '));
const areaPath = computed(() => segments.value.filter((pts) => pts.length > 1)
  .map((pts) => `${linePathFor(pts)} L${pts.at(-1).x},${H} L${pts[0].x},${H} Z`).join(' '));

const lastPoint = computed(() => coords.value[coords.value.length - 1] || null);

const baselineY = computed(() => {
  const s = stats.value; const b = baselineValue.value;
  if (!s || b == null) return null;
  const span = s.max - s.min;
  return round(span === 0 ? H / 2 : H - PAD_Y - ((b - s.min) / span) * (H - PAD_Y * 2));
});

const hoverIdx = ref(null);
watch(() => [props.points, props.label, props.unit], () => { hoverIdx.value = null; });
const hoverPoint = computed(() => (hoverIdx.value == null ? null : coords.value[hoverIdx.value]));

const tipStyle = computed(() => {
  const p = hoverPoint.value;
  if (!p) return {};
  return { left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` };
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

const spanLong = computed(() => {
  if (!stats.value) return false;
  return new Date(stats.value.lastAt) - new Date(stats.value.firstAt) > 20 * 3600 * 1000;
});

function fmtTime(t) {
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return spanLong.value ? `${d.getMonth() + 1}/${d.getDate()} ${hm}` : hm;
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
          <line
            v-if="baselineY != null"
            class="series-baseline"
            :x1="PAD_X"
            :x2="W - PAD_X"
            :y1="baselineY"
            :y2="baselineY"
          />
          <path v-if="areaPath" class="series-area" :d="areaPath" :fill="`url(#${gid})`" />
          <path
            v-if="linePath"
            class="series-line"
            :d="linePath"
            :style="{ stroke: color }"
          />
          <line
            v-if="hoverPoint"
            class="series-guide"
            :x1="hoverPoint.x"
            :x2="hoverPoint.x"
            :y1="0"
            :y2="H"
          />
        </svg>
        <span
          v-if="hoverPoint"
          class="series-hover-dot"
          :style="{ left: `${(hoverPoint.x / W) * 100}%`, top: `${(hoverPoint.y / H) * 100}%`, background: color }"
        ></span>
        <span
          v-else-if="lastPoint"
          class="series-dot"
          :style="{ left: `${(lastPoint.x / W) * 100}%`, top: `${(lastPoint.y / H) * 100}%`, background: color }"
        ></span>
        <div
          v-if="hoverPoint"
          class="series-tip"
          :style="tipStyle"
        >
          <strong>{{ fmt(hoverPoint.v) }}</strong>
          <span>{{ fmtTime(hoverPoint.t) }}</span>
        </div>
        <span
          v-if="baselineY != null"
          class="series-baseline-tag"
          :style="{ top: `${(baselineY / H) * 100}%` }"
        >基线 {{ fmt(baselineValue) }}</span>
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

<style scoped>
.series-baseline { stroke: rgba(42,29,23,.45); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.series-baseline-tag { position: absolute; left: 0; transform: translateY(-110%); padding: 0 4px; border-radius: 4px; background: rgba(255,255,255,.85); font-size: 10px; color: var(--ink-soft, #6b6259); pointer-events: none; }
</style>
