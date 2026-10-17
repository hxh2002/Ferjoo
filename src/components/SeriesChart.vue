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
// 设备正常按分钟上报；超过 40 分钟没有新采样视为这一段没有数据，曲线必须断开。
// 与趋势页判断采样窗口的规则保持一致。
const GAP_MS = 40 * 60 * 1000;

const gid = useId();
const gridYs = [H * 0.25, H * 0.5, H * 0.75];

const samples = computed(() => {
  const sorted = (props.points || [])
    .filter((p) => Number.isFinite(Date.parse(p?.t)))
    .slice().sort((a, b) => new Date(a.t) - new Date(b.t));
  // 同一 recorded_at 可能有多条原始读数，落在同一个 x 上会连成竖直尖峰。
  // 同一时间戳优先保留有值的读数，其次保留最后一条。
  const unique = [];
  for (const point of sorted) {
    const prev = unique.at(-1);
    if (prev && new Date(prev.t).getTime() === new Date(point.t).getTime()) {
      if (Number.isFinite(point.v) || !Number.isFinite(prev.v)) unique[unique.length - 1] = point;
    } else unique.push(point);
  }
  return unique;
});
// 只要该采样有有效值就必须画出，不能因为整行被标记故障就连点一起丢掉。
const series = computed(() => samples.value.filter((p) => Number.isFinite(p?.v)));

const baselineValue = computed(() => (Number.isFinite(props.baseline) ? props.baseline : null));

const stats = computed(() => {
  if (!series.value.length) return null;
  const values = series.value.map((p) => p.v);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // 基线只参与绘图范围，不参与 min/max 文案；否则基线高于数据时会把真正的数据极值顶掉。
  const bounds = baselineValue.value == null ? values : [...values, baselineValue.value];
  const last = values[values.length - 1];
  return {
    min: Math.min(...bounds),
    max: Math.max(...bounds),
    dataMin,
    dataMax,
    last,
    delta: last - values[0],
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
  let cursor = 0;
  let prevT = null;
  return pts.map((p, index) => {
    const t = new Date(p.t).getTime();
    // 两个有效采样之间只要有空值行，就说明这段没有数据。
    let empty = false;
    while (cursor < samples.value.length && new Date(samples.value[cursor].t).getTime() <= t) {
      if (!Number.isFinite(samples.value[cursor++].v)) empty = true;
    }
    const breakBefore = index > 0 && (empty || t - prevT > GAP_MS);
    prevT = t;
    return {
      x: round(pts.length > 1 ? PAD_X + ((t - tMin) / tSpan) * (W - PAD_X * 2) : W / 2),
      y: round(span === 0 ? H / 2 : H - PAD_Y - ((p.v - min) / span) * (H - PAD_Y * 2)),
      t: p.t,
      v: p.v,
      breakBefore
    };
  });
});

function round(n) {
  return Number(n.toFixed(2));
}

function linePathFor(pts) {
  if (pts.length < 2) return '';
  return `M${pts.map((p) => `${p.x},${p.y}`).join(' L')}`;
}

// 无数据处必须断开：按 breakBefore 切成若干段，段与段之间不画连线，也不填面积。
const segments = computed(() => {
  const list = [];
  let current = [];
  for (const point of coords.value) {
    if (point.breakBefore && current.length) { list.push(current); current = []; }
    current.push(point);
  }
  if (current.length) list.push(current);
  return list;
});
const linePaths = computed(() => segments.value.map(linePathFor).filter(Boolean));
const areaPaths = computed(() => segments.value
  .filter((pts) => pts.length > 1)
  .map((pts) => `${linePathFor(pts)} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`));

const lastPoint = computed(() => coords.value[coords.value.length - 1] || null);

const baselineY = computed(() => {
  const s = stats.value; const b = baselineValue.value;
  if (!s || b == null) return null;
  const span = s.max - s.min;
  return round(span === 0 ? H / 2 : H - PAD_Y - ((b - s.min) / span) * (H - PAD_Y * 2));
});
// 基线贴近顶部时标签放到线下方，避免和左上角的 max 标签叠在一起。
const baselineBelow = computed(() => baselineY.value != null && baselineY.value < H * 0.25);

const hoverIdx = ref(null);
watch(() => [props.points, props.label, props.unit], () => { hoverIdx.value = null; });
const hoverPoint = computed(() => (hoverIdx.value == null ? null : coords.value[hoverIdx.value]));
// 只有一个有效采样时才补点；其余点都在折线上，不再额外画散点。
const dots = computed(() => {
  if (hoverPoint.value) return [];
  if (coords.value.length === 1) return [coords.value[0]];
  return lastPoint.value ? [lastPoint.value] : [];
});

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
              <stop offset="0%" :stop-color="color" stop-opacity=".20" />
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
          <path v-for="(d, index) in areaPaths" :key="`area-${index}`" class="series-area" :d="d" :fill="`url(#${gid})`" />
          <path
            v-for="(d, index) in linePaths"
            :key="`line-${index}`"
            class="series-line"
            :d="d"
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
        <template v-else>
          <span
            v-for="(dot, index) in dots"
            :key="`${dot.t}-${index}`"
            class="series-dot"
            :style="{ left: `${(dot.x / W) * 100}%`, top: `${(dot.y / H) * 100}%`, background: color }"
          ></span>
        </template>
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
          class="series-tag series-baseline-tag"
          :class="{ below: baselineBelow }"
          :style="{ top: `${(baselineY / H) * 100}%` }"
        >基线 {{ fmt(baselineValue) }}</span>
        <span class="series-tag series-max">max {{ fmt(stats?.dataMax) }}</span>
      </div>
      <div class="series-range">
        <span class="series-tag">min {{ fmt(stats?.dataMin) }}</span>
        <span class="series-tag">{{ fmtTime(stats?.firstAt) }} – {{ fmtTime(stats?.lastAt) }}</span>
      </div>
    </div>
    <div v-else class="series-empty">暂无可绘制的数据</div>
  </div>
</template>

<style scoped>
.series-baseline { stroke: rgba(42,29,23,.45); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
/* max、min、时间段与基线共用同一套标签样式，只靠位置区分。 */
.series-tag { display: inline-block; padding: 0 4px; border-radius: 4px; background: rgba(255,255,255,.82); font-size: 9px; font-weight: 800; line-height: 1.6; color: var(--ink-soft, #6b6259); white-space: nowrap; pointer-events: none; }
.series-max, .series-baseline-tag { position: absolute; left: 0; z-index: 1; }
.series-max { top: 0; }
.series-baseline-tag { transform: translateY(-110%); }
/* 基线贴顶时翻到线下方，避免与 max 标签重叠。 */
.series-baseline-tag.below { transform: translateY(8%); }
/* 窄图里让时间段整体换到下一行并右对齐，而不是把标签文字拆成两行。 */
.series-range { flex-wrap: wrap; }
.series-range > :last-child { margin-left: auto; }
</style>
