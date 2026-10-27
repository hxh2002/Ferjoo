<script setup>
import { computed, ref, useId, watch } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  unit: { type: String, default: '' },
  color: { type: String, default: '#C04B0A' },
  baseline: { type: Number, default: null },
  // 基线来源（手工/自动）直接跟在图内基线标签后，避免在别处再重复一次。
  baselineNote: { type: String, default: '' },
  points: { type: Array, default: () => [] }, // [{ t: ISO string, v: number }]
  // 传入固定的时间范围后，横轴始终铺满这段区间，两端留空也不压缩。
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  // 窄卡片里只显示时刻，跨天用偏移圆标表示，避免日期把一行挤成两行。
  compactTime: { type: Boolean, default: false },
  // 需要标注的关键节点，例如开始喂养的时间；用竖直虚线标在曲线上。
  markers: { type: Array, default: () => [] }, // [{ t: ISO string, label: string, row?: 'top' | 'bottom', accent?: boolean }]
  // 只有明确要求时才在图内显示节点文字，避免影响其他调用方的紧凑布局。
  markerLabels: { type: Boolean, default: false },
  // 发酵窗口等连续区间：整段铺浅色底并在起止处连线，比单点标记更能说明覆盖范围。
  bands: { type: Array, default: () => [] }, // [{ from, to, label, active }]
  // 序号只画在最能代表时间线的图上，其余图表仅保留区间底色。
  bandLabels: { type: Boolean, default: false },
  // 主数值与极值标签允许换成换算后的文案（如高度换算膨胀率），绘图用的仍是原始数值。
  valueText: { type: String, default: '' },
  minText: { type: String, default: '' },
  maxText: { type: String, default: '' }
});

const W = 100;
const H = 44;
const PAD_X = 5;
const PAD_Y = 6;
// 设备正常按分钟上报；相邻采样超过 30 分钟才视为真实空档并断开曲线，
// 更短的空白说明中间仍有采集，直接直线连上即可。
const GAP_MS = 30 * 60 * 1000;

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

// 固定横轴：只有起止都有效时才启用，否则仍按实际数据范围绘制。
const domain = computed(() => {
  const start = Date.parse(props.from);
  const end = Date.parse(props.to);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
});

const stats = computed(() => {
  if (!series.value.length) return null;
  const values = series.value.map((p) => p.v);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // 基线只参与绘图范围，不参与 min/max 文案；否则基线高于数据时会把真正的数据极值顶掉。
  const bounds = baselineValue.value == null ? values : [...values, baselineValue.value];
  let min = Math.min(...bounds);
  let max = Math.max(...bounds);
  const scale = props.label === '高度' ? { range: 30, min: 0 }
    : props.label === '湿度' ? { range: 20, min: 0, max: 100 }
      : props.label === '温度' ? { range: 20, min: -273.15 } : null;
  if (scale && max - min < scale.range) {
    const center = (min + max) / 2;
    min = center - scale.range / 2;
    max = center + scale.range / 2;
    if (scale.min != null && min < scale.min) { max += scale.min - min; min = scale.min; }
    if (scale.max != null && max > scale.max) { min -= max - scale.max; max = scale.max; }
    if (scale.min != null) min = Math.max(scale.min, min);
  }
  const last = values[values.length - 1];
  return {
    min,
    max,
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
  const tMin = domain.value?.start ?? new Date(pts[0].t).getTime();
  const tMax = domain.value?.end ?? new Date(pts.at(-1).t).getTime();
  const tSpan = Math.max(tMax - tMin, 1);
  let prevT = null;
  return pts.map((p, index) => {
    const t = new Date(p.t).getTime();
    // 只按真实时间间隔判断空档：中间夹了几条空值行不代表这里没有数据。
    const breakBefore = index > 0 && t - prevT > GAP_MS;
    prevT = t;
    return {
      x: round(domain.value || pts.length > 1 ? PAD_X + ((t - tMin) / tSpan) * (W - PAD_X * 2) : W / 2),
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

// 长空档处彻底断开：按 breakBefore 切成若干段，短空白仍是一条直线连到底。
const segments = computed(() => {
  const result = [];
  let current = [];
  for (const point of coords.value) {
    if (point.breakBefore && current.length) {
      result.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) result.push(current);
  return result;
});

const linePaths = computed(() => segments.value
  .filter((seg) => seg.length > 1)
  .map((seg) => `M${seg.map((p) => `${p.x},${p.y}`).join(' L')}`));

// 面积同样按段闭合，长空档处不留填充。
const areaPaths = computed(() => segments.value
  .filter((seg) => seg.length > 1)
  .map((seg) => `M${seg.map((p) => `${p.x},${p.y}`).join(' L')} L${seg[seg.length - 1].x},${H} L${seg[0].x},${H} Z`));

const baselineY = computed(() => {
  const s = stats.value; const b = baselineValue.value;
  if (!s || b == null) return null;
  const span = s.max - s.min;
  return round(span === 0 ? H / 2 : H - PAD_Y - ((b - s.min) / span) * (H - PAD_Y * 2));
});
// 基线贴近顶部时标签放到线下方，避免和左上角的 max 标签叠在一起。
const baselineBelow = computed(() => baselineY.value != null && baselineY.value < H * 0.25);

const hoverIdx = ref(null);
watch(() => [props.points, props.label, props.unit, props.from, props.to, props.compactTime], () => { hoverIdx.value = null; });
const hoverPoint = computed(() => (hoverIdx.value == null ? null : coords.value[hoverIdx.value]));
// 只有一个有效采样时才补点；其余点都在折线上，不再额外画散点。
// 悬停时也必须保留这些孤立点，不能被悬浮指示点替换掉。
const dots = computed(() => {
  // 长空档两侧的孤立单点无法连成线，必须单独补点，否则会整段消失。
  const singles = segments.value.filter((seg) => seg.length === 1).map((seg) => seg[0]);
  const lastSeg = segments.value[segments.value.length - 1];
  if (lastSeg && lastSeg.length > 1) singles.push(lastSeg[lastSeg.length - 1]);
  return singles;
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
function clockOf(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// 固定横轴时右下角始终显示整段区间（整天即 00:00 – 23:59），不随数据收缩。
const rangeText = computed(() => {
  if (domain.value) return `${clockOf(domain.value.start)} – ${clockOf(domain.value.end - 60000)}`;
  if (props.compactTime) return `${clockOf(stats.value?.firstAt)} – ${clockOf(stats.value?.lastAt)}`;
  return `${fmtTime(stats.value?.firstAt)} – ${fmtTime(stats.value?.lastAt)}`;
});
const rangeDayOffset = computed(() => {
  if (!props.compactTime || !stats.value) return 0;
  const start = domain.value?.start ?? new Date(stats.value.firstAt).getTime();
  // 固定横轴时右端显示的是 end - 1 分钟，跨天判断也按这个时刻算。
  const end = (domain.value ? domain.value.end - 60000 : new Date(stats.value.lastAt).getTime());
  const first = new Date(start); const last = new Date(end);
  return Math.round((Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / 86400000);
});
const rangeTitle = computed(() => stats.value ? `${new Date(stats.value.firstAt).toLocaleString()} – ${new Date(stats.value.lastAt).toLocaleString()}` : '');

// 标记点只画在可见时间范围内，超出部分直接忽略。
const markerLines = computed(() => {
  if (!props.markers?.length || !stats.value) return [];
  const start = domain.value?.start ?? new Date(stats.value.firstAt).getTime();
  const end = domain.value?.end ?? new Date(stats.value.lastAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return props.markers
    .map((marker) => ({
      t: Date.parse(marker?.t),
      label: marker?.label || '喂养',
      row: marker?.row === 'bottom' ? 'bottom' : 'top',
      accent: !!marker?.accent
    }))
    .filter((marker) => Number.isFinite(marker.t) && marker.t >= start && marker.t <= end)
    .map((marker) => {
      const x = round(PAD_X + ((marker.t - start) / (end - start)) * (W - PAD_X * 2));
      const percent = (x / W) * 100;
      return {
        x,
        label: marker.label,
        row: marker.row,
        accent: marker.accent,
        // 贴近两端时改用左/右对齐，标签文字不会被裁掉。
        align: percent < 12 ? 'start' : percent > 88 ? 'end' : 'center',
        title: `${marker.label} ${new Date(marker.t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      };
    });
});
// 区间按固定横轴裁切：跨天窗口只显示落在当天的一段，仍在进行的窗口保留到观测末端。
const bandRects = computed(() => {
  if (!props.bands?.length || !stats.value) return [];
  const start = domain.value?.start ?? new Date(stats.value.firstAt).getTime();
  const end = domain.value?.end ?? new Date(stats.value.lastAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return props.bands.map((band, index) => {
    const from = Date.parse(band?.from);
    if (!Number.isFinite(from)) return null;
    const rawTo = Date.parse(band?.to);
    const to = Number.isFinite(rawTo) ? rawTo : end;
    if (to <= start || from >= end) return null;
    const left = Math.max(from, start);
    const right = Math.min(to, end);
    const x1 = round(PAD_X + ((left - start) / (end - start)) * (W - PAD_X * 2));
    const x2 = round(PAD_X + ((right - start) / (end - start)) * (W - PAD_X * 2));
    if (x2 - x1 < 0.2) return null;
    const percent = (x1 / W) * 100;
    return {
      key: `${band?.label || index}-${from}`,
      x1, x2, width: x2 - x1,
      showStart: from >= start,
      showEnd: Number.isFinite(rawTo) && rawTo <= end,
      label: band?.label || '',
      active: !!band?.active,
      alt: index % 2 === 1,
      align: percent < 6 ? 'start' : percent > 94 ? 'end' : 'center'
    };
  }).filter(Boolean);
});
const bandBadges = computed(() => {
  let lastX = -Infinity;
  let row = 0;
  return bandRects.value
    .filter((band) => band.label)
    .slice()
    .sort((a, b) => a.x1 - b.x1)
    .map((band) => {
      // 连续多次喂养时序号会靠得很近，交替上下错开避免叠在一起。
      row = band.x1 - lastX < 7 ? (row + 1) % 2 : 0;
      lastX = band.x1;
      return { ...band, row };
    });
});
</script>

<template>
  <div class="series-chart">
    <div class="series-head">
      <span class="series-label"><slot name="label">{{ label }}</slot></span>
      <div class="series-headline">
        <span v-if="stats" class="series-delta" :class="deltaClass">{{ deltaText }}</span>
        <strong class="series-value">{{ valueText || fmt(stats?.last) }}</strong>
        <slot name="after-header" />
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
          <g v-for="band in bandRects" :key="`band-${band.key}`">
            <rect
              class="series-band"
              :class="{ active: band.active, alt: band.alt }"
              :x="band.x1"
              y="0"
              :width="band.width"
              :height="H"
            />
            <line
              v-if="band.showStart"
              class="series-band-edge start"
              :x1="band.x1"
              :x2="band.x1"
              y1="0"
              :y2="H"
            />
            <line
              v-if="band.showEnd"
              class="series-band-edge"
              :class="band.active ? 'now' : 'end'"
              :x1="band.x2"
              :x2="band.x2"
              y1="0"
              :y2="H"
            />
          </g>
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
          <path
            v-for="(d, index) in areaPaths"
            :key="`area-${index}`"
            class="series-area"
            :d="d"
            :fill="`url(#${gid})`"
          />
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
        <template v-if="bandLabels">
          <span
            v-for="band in bandBadges"
            :key="`band-badge-${band.key}`"
            class="series-band-badge"
            :class="[band.align, { raised: band.row === 1 }]"
            :style="{ left: `${(band.x1 / W) * 100}%` }"
          >{{ band.label }}</span>
        </template>
        <span
          v-for="(marker, index) in markerLines"
          :key="`marker-${index}`"
          class="series-marker"
          :class="{ accent: marker.accent }"
          :style="{ left: `${(marker.x / W) * 100}%` }"
          :title="marker.title"
        ><span v-if="markerLabels" class="series-marker-label" :class="[marker.row, marker.align]">{{ marker.label }}</span></span>
        <span
          v-for="(dot, index) in dots"
          :key="`${dot.t}-${index}`"
          class="series-dot"
          :style="{ left: `${(dot.x / W) * 100}%`, top: `${(dot.y / H) * 100}%`, background: color }"
        ></span>
        <span
          v-if="hoverPoint"
          class="series-hover-dot"
          :style="{ left: `${(hoverPoint.x / W) * 100}%`, top: `${(hoverPoint.y / H) * 100}%`, background: color }"
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
          class="series-tag series-baseline-tag"
          :class="{ below: baselineBelow }"
          :style="{ top: `${(baselineY / H) * 100}%` }"
        >基线 {{ fmt(baselineValue) }}<template v-if="baselineNote"> · {{ baselineNote }}</template></span>
        <span class="series-tag series-max">max {{ maxText || fmt(stats?.dataMax) }}</span>
      </div>
      <div class="series-range">
        <span class="series-tag">min {{ minText || fmt(stats?.dataMin) }}</span>
        <span class="series-tag series-time-range" :title="rangeTitle"><span v-if="rangeDayOffset" class="day-offset">{{ rangeDayOffset > 0 ? `−${rangeDayOffset}` : `+${Math.abs(rangeDayOffset)}` }}</span>{{ rangeText }}</span>
      </div>
    </div>
    <div v-else class="series-empty">暂无可绘制的数据</div>
  </div>
</template>

<style scoped>
.series-baseline { stroke: rgba(42,29,23,.45); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
/* 发酵窗口整段底色：相邻轮次用两种极浅的深浅交替，仍能看出边界。 */
.series-band { fill: rgba(48, 37, 31, .045); }
.series-band.alt { fill: rgba(48, 37, 31, .075); }
.series-band.active { fill: rgba(43, 108, 176, .10); }
.series-band-edge { stroke: rgba(164, 66, 19, .45); stroke-width: .7; vector-effect: non-scaling-stroke; }
.series-band-edge.start { stroke: rgba(164, 66, 19, .85); }
.series-band-edge.end { stroke-dasharray: 2 2; }
.series-band-edge.now { stroke: rgba(43, 108, 176, .55); stroke-dasharray: 1 2; }
/* 序号贴在区间起点下方，和记录页的轮次编号一一对应。 */
.series-band-badge {
  position: absolute;
  bottom: 1px;
  z-index: 2;
  display: grid;
  place-items: center;
  min-width: 11px;
  height: 11px;
  padding: 0 2px;
  border-radius: 50%;
  background: #a44213;
  color: #fff;
  font-size: 6.5px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  transform: translateX(-50%);
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .85);
}
.series-band-badge.start { transform: translateX(0); }
.series-band-badge.end { transform: translateX(-100%); }
.series-band-badge.raised { bottom: 13px; }
/* 喂养等关键节点：从顶部的圆点向下拉一条淡虚线，不抢曲线本身。 */
.series-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed rgba(164, 66, 19, .45);
  pointer-events: none;
}
.series-marker::before {
  content: '';
  position: absolute;
  top: 0;
  left: -2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #a44213;
}
/* 本轮起点用更实的线强调；上轮与终点的标签放下排，避免和左上的 max 标签重叠。 */
.series-marker.accent { border-left-color: rgba(164, 66, 19, .85); }
.series-marker-label {
  position: absolute;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, .88);
  font-size: 8.5px;
  font-weight: 700;
  line-height: 1.7;
  color: #8a8078;
  white-space: nowrap;
}
.series-marker-label.top { top: 14px; }
.series-marker-label.bottom { bottom: 0; }
.series-marker-label.center { transform: translateX(-50%); }
.series-marker-label.start { left: 2px; }
.series-marker-label.end { right: 2px; }
.series-marker.accent .series-marker-label { color: #a44213; background: rgba(255, 240, 236, .92); }
/* 孤立点沿用折线的方形笔触，尺寸跟随当前图表的折线宽度，大图同步放大。 */
.series-dot {
  width: calc(var(--series-stroke, 1.8px) * 2.5);
  height: calc(var(--series-stroke, 1.8px) * 2.5);
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
/* max、min、时间段与基线共用同一套标签样式，只靠位置区分。 */
.series-tag { display: inline-block; padding: 0 4px; border-radius: 4px; background: rgba(255,255,255,.82); font-size: 9px; font-weight: 800; line-height: 1.6; color: var(--ink-soft, #6b6259); white-space: nowrap; pointer-events: none; }
.series-max, .series-baseline-tag { position: absolute; left: 0; z-index: 1; }
.series-max { top: 0; }
.series-baseline-tag { transform: translateY(-110%); }
/* 基线贴顶时翻到线下方，避免与 max 标签重叠。 */
.series-baseline-tag.below { transform: translateY(8%); }
/* 数值和时间段保持完整，避免窄卡片把数字拆成多行。 */
.series-head { min-width: 0; gap: 4px; }
.series-headline { min-width: 0; flex: 0 1 auto; flex-wrap: nowrap; gap: 4px; }
.series-value, .series-delta { flex-shrink: 0; font-variant-numeric: tabular-nums; }
.series-range { flex-wrap: nowrap; min-width: 0; gap: 4px; }
.series-range > :last-child { margin-left: auto; min-width: 0; }
.series-time-range { display: inline-flex; align-items: center; gap: 2px; }
.series-time-range .day-offset { display: inline-grid; place-items: center; min-width: 10px; height: 10px; padding: 0 1px; border-radius: var(--radius-badge); background: #f2dcd7; color: #a4524a; font-size: 6.5px; line-height: 1; font-weight: 600; }
</style>
