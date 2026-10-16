<script setup>
import { computed, ref, watch } from 'vue';
import { METRICS, metricGeometry } from '../services/mobile-device.service.js';
const props = defineProps({ rows: { type: Array, default: () => [] }, metric: { type: String, default: 'height_mm' }, from: String, to: String, baseline: { type: Number, default: null } });
const emit = defineEmits(['select']);
const selected = ref(null);
const meta = computed(() => METRICS[props.metric] || METRICS.height_mm);
const color = computed(() => ({ height_mm: '#2B6CB0', temperature_c: '#C04B0A', humidity_percent: '#2B7A55', battery_percent: '#7A5C14' }[props.metric]));
const geometry = computed(() => {
  const result = metricGeometry(props.rows, props.metric, props.from, props.to);
  if (props.metric !== 'height_mm' || props.baseline == null) return result;
  const min = Math.min(result.min, props.baseline - 1); const max = Math.max(result.max, props.baseline + 1);
  for (const point of result.points) point.y = point.value == null ? null : 178 - (point.value - min) / (max - min) * 150;
  return { ...result, min, max, baselineY: 178 - (props.baseline - min) / (max - min) * 150 };
});
watch([() => props.metric, () => props.rows], () => { selected.value = null; });
function select(point) { if (point.value == null) return; selected.value = point; emit('select', point.row); }
function label(value) { return value == null ? '未测量' : `${value} ${meta.value.unit}`; }
</script>
<template>
  <div class="m-chart" :aria-label="`${meta.label}趋势图`">
    <svg viewBox="0 0 360 220" role="img" :aria-label="`${meta.label}，单位${meta.unit}，横轴为本地时间`">
      <line x1="52" y1="178" x2="344" y2="178" stroke="#75665B"/><line x1="52" y1="28" x2="52" y2="178" stroke="#75665B"/>
      <text x="8" y="18">{{ meta.unit }}</text><text x="8" y="32">{{ geometry.max.toFixed(1) }}</text><text x="8" y="182">{{ geometry.min.toFixed(1) }}</text>
      <template v-if="geometry.baselineY != null"><line x1="52" x2="344" :y1="geometry.baselineY" :y2="geometry.baselineY" stroke="#75665B" stroke-dasharray="5 4"/><text x="56" :y="geometry.baselineY - 5">基准 {{ baseline }} mm</text></template>
      <polyline v-for="(segment,index) in geometry.segments" :key="index" :points="segment.map(p => `${p.x},${p.y}`).join(' ')" fill="none" :stroke="color" stroke-width="3"/>
      <g v-for="point in geometry.points" :key="point.row.id || point.time"><circle v-if="point.value != null" :cx="point.x" :cy="point.y" r="10" fill="transparent" tabindex="0" role="button" :aria-label="`${new Date(point.time).toLocaleString()} ${label(point.value)}`" @click="select(point)" @keydown.enter="select(point)" @keydown.space.prevent="select(point)"/><circle v-if="point.value != null" :cx="point.x" :cy="point.y" r="3" :fill="color" pointer-events="none"/></g>
      <text x="52" y="205">{{ new Date(from).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }}</text><text x="344" y="205" text-anchor="end">{{ new Date(to).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }}</text>
    </svg>
    <div v-if="selected" class="m-reading" aria-live="polite"><strong>{{ label(selected.value) }}</strong><span>{{ new Date(selected.time).toLocaleString() }}</span><span>有效发酵采样</span></div>
    <p v-if="!geometry.points.some(p => p.value != null)">这个范围没有可用的{{ meta.label }}数据。</p>
  </div>
</template>
<style scoped>.m-chart svg{width:100%;overflow:visible}.m-chart text{font-size:11px;fill:#75665B}.m-reading{display:grid;gap:4px;margin-top:8px;line-height:1.6}</style>
