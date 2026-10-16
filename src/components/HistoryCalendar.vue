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
        <span><i class="lg observation"></i>观察</span>
        <span><i class="lg feeding"></i>喂养</span>
        <span><i class="lg sleep"></i>仅休眠</span>
        <span><i class="lg fer"></i>发酵中</span>
      </div>
    </div>
    <label class="cal-narrow">选择日期<input type="date" :value="selected" @change="emit('select', $event.target.value)"></label>
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
<style scoped>
.cal-narrow{display:none}.cal-week,.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:0}.cal-week{text-align:center}.cal-cell{position:relative;min-height:44px;min-width:0;border:0;background:transparent;color:#30251f;font:inherit}.cal-cell.selected{background:#a54214;color:#fff}.cal-cell.off{opacity:.5}.cal-cell.fer:after,.cal-cell.sleep:after,.cal-cell.observation:after,.cal-cell.feeding:after{content:'';display:block;width:5px;height:5px;position:absolute;bottom:4px;left:calc(50% - 2px);background:#286247}.cal-cell.observation:after{background:#2b6cb0}.cal-cell.feeding:after{background:#a54214}.cal-nav{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.cal-nav button{min-height:44px;min-width:44px}.cal-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px}.cal-narrow input{width:100%;box-sizing:border-box;min-height:48px;font:inherit}
@media(max-width:347px){.cal-week,.cal-grid{display:none}.cal-narrow{display:grid;gap:8px}}
</style>
