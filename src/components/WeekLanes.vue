<script setup>
import { computed, reactive, ref } from 'vue';

// 分辨率 2：七日时间带。每列是一天，0:00 在顶部、24:00 在底部。
// 数据段着色：fer=绿 sleep=红。诊断窗口以高亮带呈现，开始/结束手柄可拖动。
const props = defineProps({
  days: { type: Array, required: true }, // [{ key, dayMs, label, sub }]
  records: { type: Array, default: () => [] }, // 升序行
  windows: { type: Array, default: () => [] }, // [{ id, start, end, kind, follow }]
  activeWindowId: { type: String, default: '' },
  createMode: { type: Boolean, default: false },
  pendingStart: { type: Number, default: null }
});
const emit = defineEmits(['lane-click', 'select-window', 'drag-window']);

const DAY_MS = 24 * 60 * 60 * 1000;
const BLOCK_TAIL_MS = 10 * 60 * 1000; // 末尾数据块的默认展示时长
const SNAP_MS = 5 * 60 * 1000;
const MIN_WINDOW_MS = 10 * 60 * 1000;
const HOUR_MARKS = [0, 6, 12, 18, 24];

const laneEls = ref([]);
const drag = reactive({ id: '', edge: '', label: '', active: false, suppressClick: false });

function ts(row) {
  return new Date(row.recorded_at).getTime();
}

// 每天的数据颜色块：一条记录从其时间延伸到下一条记录（末尾默认 10 分钟）。
const dayBlocks = computed(() => {
  const rows = props.records;
  const times = rows.map((r) => ts(r));
  return props.days.map((day) => {
    const dayStart = day.dayMs;
    const dayEnd = dayStart + DAY_MS;
    const blocks = [];
    for (let i = 0; i < rows.length; i += 1) {
      const t = times[i];
      const next = i + 1 < rows.length ? times[i + 1] : t + BLOCK_TAIL_MS;
      const s = Math.max(t, dayStart);
      const e = Math.min(next, dayEnd);
      if (e - s < 60 * 1000 || s >= dayEnd) continue;
      blocks.push({
        id: rows[i].id ?? i,
        top: ((s - dayStart) / DAY_MS) * 100,
        height: ((e - s) / DAY_MS) * 100,
        mode: rows[i].mode === 'fer' ? 'fer' : 'sleep',
        err: Boolean(rows[i].sensor_error)
      });
    }
    return blocks;
  });
});

// 窗口带：一个窗口可能跨多天，每列渲染重叠部分；首/尾列挂拖拽手柄。
const bands = computed(() => {
  if (!props.days.length) return [];
  const out = [];
  for (const w of props.windows) {
    for (let i = 0; i < props.days.length; i += 1) {
      const dayStart = props.days[i].dayMs;
      const dayEnd = dayStart + DAY_MS;
      const s = Math.max(w.start, dayStart);
      const e = Math.min(w.end, dayEnd);
      if (e <= s) continue;
      out.push({
        key: `${w.id}:${props.days[i].key}`,
        id: w.id,
        dayKey: props.days[i].key,
        top: ((s - dayStart) / DAY_MS) * 100,
        height: ((e - s) / DAY_MS) * 100,
        active: w.id === props.activeWindowId,
        manual: w.kind !== 'auto',
        hasStartHandle: w.start >= dayStart && w.start < dayEnd,
        hasEndHandle: w.end > dayStart && w.end <= dayEnd,
        startPct: ((w.start - dayStart) / DAY_MS) * 100,
        endPct: ((w.end - dayStart) / DAY_MS) * 100
      });
    }
  }
  return out;
});

const pendingMark = computed(() => {
  if (props.pendingStart == null) return null;
  for (const day of props.days) {
    if (props.pendingStart >= day.dayMs && props.pendingStart < day.dayMs + DAY_MS) {
      return {
        dayKey: day.key,
        top: ((props.pendingStart - day.dayMs) / DAY_MS) * 100,
        label: fmtClock(props.pendingStart)
      };
    }
  }
  return null;
});

function fmtClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtStamp(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${fmtClock(ms)}`;
}

function bandsOf(dayKey) {
  return bands.value.filter((b) => b.dayKey === dayKey);
}

function setLaneRef(el, i) {
  if (el) laneEls.value[i] = el;
}

function msFromPoint(clientX, clientY) {
  for (let i = 0; i < laneEls.value.length; i += 1) {
    const r = laneEls.value[i].getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right) {
      const frac = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      return props.days[i].dayMs + frac * DAY_MS;
    }
  }
  return null;
}

function onLaneClick(e, day) {
  if (drag.suppressClick) return;
  const r = e.currentTarget.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  emit('lane-click', Math.round((day.dayMs + frac * DAY_MS) / SNAP_MS) * SNAP_MS);
}

function startDrag(e, band, edge) {
  if (props.createMode) return;
  e.preventDefault();
  e.stopPropagation();
  const el = e.currentTarget;
  drag.id = band.id;
  drag.edge = edge;
  drag.active = true;
  drag.suppressClick = false;
  el.setPointerCapture(e.pointerId);
  emit('select-window', band.id);

  const onMove = (ev) => {
    const raw = msFromPoint(ev.clientX, ev.clientY);
    if (raw == null) return;
    const w = props.windows.find((x) => x.id === drag.id);
    if (!w) return;
    const weekStart = props.days[0].dayMs;
    const weekEnd = props.days[props.days.length - 1].dayMs + DAY_MS;
    let ms = Math.round(raw / SNAP_MS) * SNAP_MS;
    ms = Math.min(weekEnd, Math.max(weekStart, ms));
    if (drag.edge === 'start') ms = Math.min(ms, w.end - MIN_WINDOW_MS);
    else ms = Math.max(ms, w.start + MIN_WINDOW_MS);
    if (ms === w[drag.edge]) return;
    drag.label = `${drag.edge === 'start' ? '开始' : '结束'} ${fmtStamp(ms)}`;
    drag.suppressClick = true;
    emit('drag-window', { id: drag.id, edge: drag.edge, ms });
  };
  const onUp = () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    drag.active = false;
    setTimeout(() => { drag.suppressClick = false; drag.label = ''; }, 0);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
}
</script>

<template>
  <div class="week-strip" :class="{ creating: createMode }">
    <div class="hour-rail" aria-hidden="true">
      <span v-for="h in HOUR_MARKS" :key="h" :style="{ top: `${(h / 24) * 100}%` }">{{ String(h).padStart(2, '0') }}:00</span>
    </div>
    <div class="week-lanes">
      <div v-for="(day, i) in days" :key="day.key" class="lane">
        <div class="lane-head"><strong>{{ day.label }}</strong><small>{{ day.sub }}</small></div>
        <div
          :ref="(el) => setLaneRef(el, i)"
          class="lane-body"
          :title="createMode ? '点击设置窗口起点 / 终点' : ''"
          @click="onLaneClick($event, day)"
        >
          <span
            v-for="h in HOUR_MARKS"
            :key="h"
            class="lane-grid"
            :class="{ edge: h === 0 || h === 24 }"
            :style="{ top: `${(h / 24) * 100}%` }"
          ></span>
          <i
            v-for="b in dayBlocks[i]"
            :key="b.id"
            class="lane-block"
            :class="[`mode-${b.mode}`, { err: b.err }]"
            :style="{ top: `${b.top}%`, height: `${b.height}%` }"
            :title="`${b.mode === 'fer' ? '发酵' : '休眠'}${b.err ? ' · 传感器故障' : ''}`"
          ></i>
          <template v-for="band in bandsOf(day.key)" :key="band.key">
            <i
              class="win-band"
              :class="{ active: band.active, manual: band.manual }"
              :style="{ top: `${band.top}%`, height: `${band.height}%` }"
              :title="band.manual ? '手动诊断窗口' : '自动识别的诊断窗口'"
              @click.stop="emit('select-window', band.id)"
            ></i>
            <span
              v-if="band.hasStartHandle"
              class="win-handle"
              :class="{ active: drag.active && drag.id === band.id && drag.edge === 'start' }"
              :style="{ top: `${band.startPct}%` }"
              title="拖动调整开始时间"
              @pointerdown="startDrag($event, band, 'start')"
            ><i></i></span>
            <span
              v-if="band.hasEndHandle"
              class="win-handle end"
              :class="{ active: drag.active && drag.id === band.id && drag.edge === 'end' }"
              :style="{ top: `${band.endPct}%` }"
              title="拖动调整结束时间"
              @pointerdown="startDrag($event, band, 'end')"
            ><i></i></span>
          </template>
          <span
            v-if="pendingMark && pendingMark.dayKey === day.key"
            class="pending-mark"
            :style="{ top: `${pendingMark.top}%` }"
          ><em>{{ pendingMark.label }}</em></span>
        </div>
      </div>
    </div>
    <span v-if="drag.label" class="drag-toast">{{ drag.label }}</span>
  </div>
</template>
