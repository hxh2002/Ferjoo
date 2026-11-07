<script setup>
import { computed } from 'vue';
import { localDayKey } from '../../lib/mobile-records.js';
import { WEEKDAY_LABELS, calendarGrid, calendarMonth, calendarTitle, shiftCalendarMonth } from '../../lib/mobile-calendar.js';

const props = defineProps({
  modelValue: { type: String, default: '' },
  month: { type: String, default: '' },
  min: { type: String, default: '1900-01-01' },
  max: { type: String, default: '' },
  marked: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  // size="compact" → 295×209（喂养时间卡，370:16808）；"large" → 327×247（日记整月 / 轮次选择日期，370:18188）
  size: { type: String, default: 'large' }
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
  if (!props.disabled && !cell.disabled) emit('update:modelValue', cell.date);
}
</script>

<template>
  <section class="m-calendar" :class="`is-${size}`" :aria-label="calendarTitle(shownMonth)">
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
        :disabled="disabled || cell.disabled"
        :aria-pressed="cell.date === modelValue"
        :aria-label="cell.date"
        @click="choose(cell)"
      ><span class="m-calendar-fill">{{ cell.day }}</span></button>
    </div>
  </section>
</template>

<style scoped>
/* 几何取自 370:16808（compact）与 370:18188（large）。列宽 / 行高按画板实测，不再用 1fr 拉伸。 */
.m-calendar {
  --m-cal-col: 36px;
  --m-cal-row: 25px;
  --m-cal-col-gap: 5px;
  --m-cal-row-gap: 3px;
  --m-cal-fill-w: 36px;
  --m-cal-fill-h: 25px;
  --m-cal-fill-radius: 10px;
  --m-cal-font: 12px;
  --m-cal-week-font: 11px;
  --m-cal-title-font: 14px;
  --m-cal-title-line: 20px;
  --m-cal-nav: 20px;
  --m-cal-week: 15px;
  --m-cal-pad: 8px 0 0;
  --m-cal-min: 209px;
  width: 100%;
  min-height: var(--m-cal-min);
  padding: var(--m-cal-pad);
  box-sizing: border-box;
}
.m-calendar.is-large {
  --m-cal-col: 40px;
  --m-cal-row: 30px;
  --m-cal-col-gap: 4px;
  --m-cal-fill-w: 25px;
  --m-cal-fill-h: 25px;
  --m-cal-fill-radius: 50%;
  --m-cal-week-font: 12px;
  --m-cal-title-line: 24px;
  --m-cal-nav: 35px;
  --m-cal-week: 24px;
  --m-cal-pad: 5px 0 0;
  --m-cal-min: 247px;
}
.m-calendar-nav { display: flex; align-items: center; height: var(--m-cal-nav); }
.m-calendar-nav strong { flex: 1; min-width: 0; text-align: center; font-size: var(--m-cal-title-font); font-weight: 400; line-height: var(--m-cal-title-line); color: var(--text-primary); }
.m-calendar-move { position: relative; flex: none; width: 44px; height: 100%; min-height: 0; padding: 0; border: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: 20px; line-height: 1; cursor: pointer; }
/* 展开到 44×44 的可点区域，视觉几何保持不变。 */
.m-calendar-move::after { content: ''; position: absolute; top: 50%; left: 50%; width: 44px; height: 44px; transform: translate(-50%, -50%); }
.m-calendar-move:disabled { opacity: .3; cursor: not-allowed; }
.m-calendar-weekdays, .m-calendar-grid { display: grid; grid-template-columns: repeat(7, var(--m-cal-col)); column-gap: var(--m-cal-col-gap); justify-content: center; }
.m-calendar-weekdays { height: var(--m-cal-week); margin: 6px 0 5px; align-items: center; color: var(--text-secondary); font-size: var(--m-cal-week-font); line-height: var(--m-cal-week); text-align: center; }
.is-large .m-calendar-weekdays { margin: 0 0 5px; }
.m-calendar-grid { row-gap: var(--m-cal-row-gap); }
.m-calendar-day { position: relative; display: grid; place-items: center; width: var(--m-cal-col); height: var(--m-cal-row); min-height: 0; padding: 0; border: 0; background: transparent; color: var(--text-primary); font: inherit; font-size: var(--m-cal-font); line-height: 1; cursor: pointer; }
/* 命中区最多扩到整格节距（compact 41×28、large 44×33）；295 宽下 7 列无法凑满 44×44。 */
.m-calendar-day::after { content: ''; position: absolute; inset: calc(var(--m-cal-row-gap) / -2) calc(var(--m-cal-col-gap) / -2); }
.m-calendar-fill { display: grid; place-items: center; width: var(--m-cal-fill-w); height: var(--m-cal-fill-h); border-radius: var(--m-cal-fill-radius); }
.m-calendar-day.is-marked:not(.is-selected) .m-calendar-fill { background: var(--m-icon-disc); }
.m-calendar-day.is-today .m-calendar-fill { font-weight: 500; }
.m-calendar-day.is-selected .m-calendar-fill { background: var(--brand-light); font-weight: 500; }
.m-calendar-day.is-outside { color: var(--text-muted); }
.m-calendar-day:disabled { opacity: .32; cursor: not-allowed; }
.m-calendar-day:not(:disabled):active .m-calendar-fill { background: var(--surface-selected); }
@media (prefers-reduced-motion: reduce) {
  .m-calendar-day, .m-calendar-move { transition: none; }
}
</style>
