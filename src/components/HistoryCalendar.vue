<script setup>
import { computed } from 'vue';

// 分辨率 1：月份总览。每个日期三种状态：
// none=无数据（灰） sleep=只有休眠数据（红） fer=有有效发酵数据（绿）。
const props = defineProps({
  month: { type: Number, required: true }, // 当月任意时间戳
  stats: { type: Object, default: () => ({}) }, // { 'YYYY-MM-DD': 'none'|'sleep'|'fer' }
  selected: { type: String, default: '' }
});
const emit = defineEmits(['select', 'change-month']);

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const monthDate = computed(() => new Date(props.month));
const title = computed(() => `${monthDate.value.getFullYear()} 年 ${monthDate.value.getMonth() + 1} 月`);
const todayKey = computed(() => keyOf(new Date()));

const cells = computed(() => {
  const y = monthDate.value.getFullYear();
  const m = monthDate.value.getMonth();
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // 周一为一周起点
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const out = [];
  for (let i = 0; i < total; i += 1) {
    const d = new Date(y, m, 1 - lead + i);
    out.push({
      key: keyOf(d),
      day: d.getDate(),
      inMonth: i >= lead && i < lead + daysInMonth,
      today: keyOf(d) === todayKey.value
    });
  }
  return out;
});
</script>

<template>
  <div class="month-cal">
    <div class="cal-head">
      <p class="eyebrow dark">TIME OVERVIEW</p>
      <div class="cal-nav">
        <button type="button" class="cal-nav-btn" aria-label="上个月" @click="emit('change-month', -1)">‹</button>
        <strong>{{ title }}</strong>
        <button type="button" class="cal-nav-btn" aria-label="下个月" @click="emit('change-month', 1)">›</button>
        <button type="button" class="cal-today" @click="emit('change-month', 0)">今天</button>
      </div>
      <div class="cal-legend" aria-hidden="true">
        <span><i class="lg none"></i>无数据</span>
        <span><i class="lg sleep"></i>仅休眠</span>
        <span><i class="lg fer"></i>发酵中</span>
      </div>
    </div>
    <div class="cal-week"><span v-for="w in WEEKDAYS" :key="w">{{ w }}</span></div>
    <div class="cal-grid">
      <button
        v-for="c in cells"
        :key="c.key"
        type="button"
        class="cal-cell"
        :class="[props.stats[c.key] || 'none', { off: !c.inMonth, today: c.today, selected: props.selected === c.key }]"
        :title="c.key"
        @click="emit('select', c.key)"
      >{{ c.day }}</button>
    </div>
  </div>
</template>
