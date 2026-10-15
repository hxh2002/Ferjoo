<script setup>
import { computed, ref } from 'vue';
import { METRICS, metricGeometry } from '../services/mobile-device.service.js';
const props = defineProps({ rows: { type: Array, default: () => [] }, metric: { type: String, default: 'height_mm' }, from: String, to: String });
const emit = defineEmits(['select']);
const selected = ref(null);
const geometry = computed(() => metricGeometry(props.rows, props.metric, props.from, props.to));
const meta = computed(() => METRICS[props.metric] || METRICS.height_mm);
function select(point) { if (point.value == null) return; selected.value = point; emit('select', point.row); }
function label(value) { return value == null ? '未测量' : `${value} ${meta.value.unit}`; }
</script>
<template>
  <div class="m-chart" aria-label="趋势图">
    <svg viewBox="0 0 360 210" role="img">
      <line x1="52" y1="178" x2="344" y2="178" stroke="#8D796A" />
      <line x1="52" y1="28" x2="52" y2="178" stroke="#8D796A" />
      <text x="8" y="32" class="m-muted">{{ geometry.max.toFixed(1) }}</text>
      <text x="8" y="182" class="m-muted">{{ geometry.min.toFixed(1) }}</text>
      <g v-for="(segment, index) in geometry.segments" :key="index">
        <polyline :points="segment.map(p => `${p.x},${p.y}`).join(' ')" fill="none" stroke="#FF6B25" stroke-width="3" />
      </g>
      <g v-for="point in geometry.points" :key="point.row.id || point.time">
        <circle v-if="point.value != null" :cx="point.x" :cy="point.y" r="5" fill="#30251F" tabindex="0" @click="select(point)" @keydown.enter="select(point)"><title>{{ label(point.value) }}</title></circle>
      </g>
    </svg>
    <div v-if="selected" class="m-card m-reading">
      <strong>{{ label(selected.value) }}</strong>
      <span>{{ new Date(selected.time).toLocaleString() }}</span>
      <span class="m-muted">{{ selected.row.sensor_error ? '传感器故障' : (selected.row.mode === 'sleep' ? '休眠' : '有效采样') }}</span>
    </div>
    <p v-if="!geometry.points.some(p => p.value != null)" class="m-muted">这个范围没有可用的{{ meta.label }}数据。</p>
  </div>
</template>
<style scoped>
.m-chart svg { width: 100%; min-height: 210px; overflow: visible; }
.m-chart text { font-size: 11px; fill: #75665B; }
.m-reading { display: grid; gap: 4px; margin-top: 8px; }
</style>
