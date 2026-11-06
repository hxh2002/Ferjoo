<script setup>
import { computed } from 'vue';
import { localDayKey } from '../../lib/mobile-records.js';
import { WEEKDAY_LABELS, calendarGrid, calendarMonth, calendarTitle, shiftCalendarMonth } from '../../lib/mobile-calendar.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  month: { type: String, default: '' },
  min: { type: String, default: '1900-01-01' },
  max: { type: String, default: '' },
  marked: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:modelValue', 'update:month']);
const shownMonth = computed(() => calendarMonth(props.month || props.modelValue));
const maxDay = computed(() => props.max || localDayKey());
const cells = computed(() => calendarGrid(shownMonth.value, { min: props.min, max: maxDay.value }));
const marks = computed(() => new Set(props.marked));

function move(amount) {
  emit('update:month', shiftCalendarMonth(shownMonth.value, amount, props.min.slice(0, 7), maxDay.value.slice(0, 7)));
}
function choose(cell) {
  if (!cell.disabled) emit('update:modelValue', cell.date);
}
</script>

<template>
  <section class="m-calendar" :aria-label="calendarTitle(shownMonth)">
    <header class="m-calendar-nav">
      <button type="button" class="m-calendar-move" aria-label="上个月" @click="move(-1)">‹</button>
      <strong>{{ calendarTitle(shownMonth) }}</strong>
      <button type="button" class="m-calendar-move" aria-label="下个月" @click="move(1)">›</button>
    </header>
    <div class="m-calendar-weekdays" aria-hidden="true">
      <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
    </div>
    <div class="m-calendar-grid" role="grid">
      <button
        v-for="cell in cells"
        :key="cell.date"
        type="button"
        class="m-calendar-day"
        role="gridcell"
        :class="{ 'is-selected': cell.date === modelValue, 'is-outside': cell.outside, 'is-today': cell.today, 'is-marked': marks.has(cell.date) }"
        :disabled="cell.disabled"
        :aria-pressed="cell.date === modelValue"
        :aria-label="cell.date"
        @click="choose(cell)"
      >{{ cell.day }}</button>
    </div>
  </section>
</template>

<style scoped>
.m-calendar { width: 100%; }
.m-calendar-nav, .m-calendar-weekdays, .m-calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); align-items: center; }
.m-calendar-nav { grid-template-columns: 44px 1fr 44px; margin-bottom: 8px; }
.m-calendar-nav strong { text-align: center; font-size: var(--text-sm); font-weight: 500; line-height: 21px; }
.m-calendar-move { width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--text-primary); font-size: 22px; cursor: pointer; }
.m-calendar-weekdays { margin-bottom: 4px; color: var(--text-secondary); font-size: var(--text-xs); line-height: 18px; text-align: center; }
.m-calendar-day { height: 36px; padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-primary); font-size: var(--text-sm); line-height: 25px; cursor: pointer; }
.m-calendar-day.is-outside { color: var(--text-muted); }
.m-calendar-day.is-marked:not(.is-selected) { background: var(--m-icon-disc); }
.m-calendar-day.is-today { font-weight: 500; }
.m-calendar-day.is-selected { background: var(--brand-light); color: var(--text-primary); font-weight: 500; }
.m-calendar-day:disabled { opacity: .32; cursor: not-allowed; }
</style>
