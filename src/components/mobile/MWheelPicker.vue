<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true }, // [{ value, label }]；空值可作为“不设置”选项由调用方显式传入
  label: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  height: { type: Number, default: 210 },
  // 年月选择按画板是 30 行高；未传入时沿用 42 的默认时间滚轮。
  rowHeight: { type: Number, default: 42 }
});
const emit = defineEmits(['update:modelValue']);
const frameStyle = computed(() => {
  const spacer = Math.max(0, (props.height - props.rowHeight) / 2);
  return {
    height: `${props.height}px`,
    '--m-wheel-row-height': `${props.rowHeight}px`,
    '--m-wheel-spacer': `${spacer}px`
  };
});
const scroller = ref(null);
let frame = 0;
let settleTimer = 0;
let syncing = false;

function clampIndex(index) {
  return Math.max(0, Math.min(props.options.length - 1, index));
}
function scrollToValue(behavior = 'instant') {
  if (!scroller.value) return;
  const index = Math.max(0, props.options.findIndex((item) => item.value === props.modelValue));
  syncing = true;
  scroller.value.scrollTo({ top: index * props.rowHeight, behavior });
  if (behavior === 'instant') requestAnimationFrame(() => { syncing = false; });
  else setTimeout(() => { syncing = false; }, 260);
}
function onScroll() {
  if (syncing || props.disabled) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const index = clampIndex(Math.round(scroller.value.scrollTop / props.rowHeight));
    const item = props.options[index];
    if (item && item.value !== props.modelValue) emit('update:modelValue', item.value);
  });
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    if (!scroller.value || syncing) return;
    const index = clampIndex(Math.round(scroller.value.scrollTop / props.rowHeight));
    syncing = true;
    scroller.value.scrollTo({ top: index * props.rowHeight, behavior: 'smooth' });
    setTimeout(() => { syncing = false; }, 260);
  }, 90);
}
function onKeydown(event) {
  if (props.disabled) return;
  const current = Math.max(0, props.options.findIndex((item) => item.value === props.modelValue));
  let next = current;
  if (event.key === 'ArrowUp') next = clampIndex(current - 1);
  else if (event.key === 'ArrowDown') next = clampIndex(current + 1);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = props.options.length - 1;
  else return;
  event.preventDefault();
  emit('update:modelValue', props.options[next].value);
  nextTick(() => scrollToValue('smooth'));
}

watch(() => props.modelValue, () => nextTick(() => scrollToValue()));
watch(() => props.options, () => nextTick(() => scrollToValue()), { deep: true });
onMounted(() => nextTick(() => scrollToValue()));
onBeforeUnmount(() => { cancelAnimationFrame(frame); clearTimeout(settleTimer); });
</script>

<template>
  <div class="m-wheel-picker" :class="{ 'is-disabled': disabled, 'is-compact': rowHeight < 42 }" :style="frameStyle">
    <span class="m-wheel-selection" aria-hidden="true" />
    <span class="m-wheel-fade m-wheel-fade-top" aria-hidden="true" />
    <span class="m-wheel-fade m-wheel-fade-bottom" aria-hidden="true" />
    <div
      ref="scroller"
      class="m-wheel-scroller"
      role="listbox"
      :aria-label="label"
      :aria-disabled="disabled"
      tabindex="0"
      @scroll="onScroll"
      @keydown="onKeydown"
    >
      <div class="m-wheel-spacer" aria-hidden="true" />
      <div
        v-for="item in options"
        :key="item.value"
        class="m-wheel-option"
        :class="{ 'is-selected': item.value === modelValue }"
        role="option"
        :aria-selected="item.value === modelValue"
      >{{ item.label }}</div>
      <div class="m-wheel-spacer" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.m-wheel-picker { position: relative; height: 210px; overflow: hidden; --m-wheel-row-height: 42px; --m-wheel-spacer: 84px; }
/* 这里的 0/1/2 是滚轮内部的层序（选中底 / 滚动内容 / 上下渐隐），只在组件自己的定位上下文里比较，
   与全局 --m-z-* 是两套坐标系；改成全局令牌反而会把渐隐抬到页面顶栏之上。 */
.m-wheel-scroller { position: relative; z-index: 1; height: 100%; overflow-y: auto; overscroll-behavior: contain; scroll-snap-type: y proximity; scrollbar-width: none; outline-offset: -2px; }
.m-wheel-scroller::-webkit-scrollbar { display: none; }
.m-wheel-spacer { height: var(--m-wheel-spacer, 84px); }
.m-wheel-option { display: flex; align-items: center; justify-content: center; height: var(--m-wheel-row-height); scroll-snap-align: center; color: var(--text-secondary); font-size: var(--text-md); line-height: 24px; }
.m-wheel-option.is-selected { color: var(--text-primary); font-weight: 500; }
/* 年月滚轮（画板 370:10344）行高 30：未选 13px / 选中 15px Medium，选中底色 var(--m-wheel-selected)。 */
.m-wheel-picker.is-compact .m-wheel-option { font-size: 13px; line-height: 1; }
.m-wheel-picker.is-compact .m-wheel-option.is-selected { font-size: 15px; }
.m-wheel-picker.is-compact .m-wheel-selection { background: var(--m-wheel-selected); border-radius: 10px; }
.m-wheel-selection { position: absolute; z-index: 0; top: var(--m-wheel-spacer, 84px); left: 0; right: 0; height: var(--m-wheel-row-height); border-radius: var(--radius-control); background: var(--surface-selected); pointer-events: none; }
.m-wheel-fade { position: absolute; z-index: 2; left: 0; right: 0; height: var(--m-wheel-spacer, 84px); pointer-events: none; }
/* 渐隐底色由外层用 --m-wheel-fade-bg 指定（白卡里用卡片色），默认仍是页面底色。 */
.m-wheel-fade-top { top: 0; background: linear-gradient(var(--m-wheel-fade-bg, var(--surface-page)), color-mix(in srgb, var(--m-wheel-fade-bg, var(--surface-page)) 0%, transparent)); }
.m-wheel-fade-bottom { bottom: 0; background: linear-gradient(color-mix(in srgb, var(--m-wheel-fade-bg, var(--surface-page)) 0%, transparent), var(--m-wheel-fade-bg, var(--surface-page))); }
.is-disabled { opacity: .55; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .m-wheel-scroller { scroll-behavior: auto; } }
</style>
