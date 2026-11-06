<script setup>
import { useId } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true }, // [{ value, label, description? }]
  label: { type: String, required: true },
  columns: { type: Number, default: 1 },
  disabled: { type: Boolean, default: false },
  name: { type: String, default: '' },
  marker: { type: String, default: 'start' }
});
const emit = defineEmits(['update:modelValue']);
const fallbackName = useId();
const groupName = props.name || `m-radio-${fallbackName}`;

function choose(value) {
  if (!props.disabled) emit('update:modelValue', value);
}
</script>

<template>
  <fieldset class="m-radio-card-group" :class="{ 'is-trailing': marker === 'end' }" :disabled="disabled">
    <legend class="m-radio-card-legend">{{ label }}</legend>
    <div class="m-radio-card-grid" :style="{ '--m-radio-columns': columns }">
      <label
        v-for="item in options"
        :key="item.value"
        class="m-radio-card"
        :class="{ 'is-selected': item.value === modelValue }"
      >
        <input
          class="m-radio-card-input"
          type="radio"
          :name="groupName"
          :value="item.value"
          :checked="item.value === modelValue"
          :disabled="disabled"
          @change="choose(item.value)"
        />
        <span class="m-radio-card-dot" aria-hidden="true" />
        <span class="m-radio-card-copy">
          <span class="m-radio-card-label">{{ item.label }}</span>
          <span v-if="item.description" class="m-radio-card-description">{{ item.description }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.m-radio-card-group { min-width: 0; margin: 0; padding: 0; border: 0; }
.m-radio-card-legend { margin-bottom: 12px; padding: 0; font-size: var(--text-sm); line-height: 21px; color: var(--text-secondary); }
.m-radio-card-grid { display: grid; grid-template-columns: repeat(var(--m-radio-columns), minmax(0, 1fr)); gap: 8px; }
.m-radio-card { position: relative; display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 10px 12px; border: 1px solid var(--border-warm); border-radius: var(--radius-control); background: var(--surface-card); cursor: pointer; transition: border-color var(--motion-fast) ease, background-color var(--motion-fast) ease; }
.m-radio-card.is-selected { border-color: var(--brand-action); background: var(--surface-selected); }
.m-radio-card-input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.m-radio-card-dot { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 20px; height: 20px; border: 1.5px solid var(--text-secondary); border-radius: 50%; background: var(--surface-input); }
.m-radio-card.is-selected .m-radio-card-dot { border-color: var(--brand-action); }
.m-radio-card.is-selected .m-radio-card-dot::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--brand-action); }
.m-radio-card-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.m-radio-card-label { font-size: var(--text-sm); line-height: 21px; color: var(--text-primary); }
.m-radio-card-description { font-size: var(--text-xs); line-height: 18px; color: var(--text-secondary); }
.m-radio-card:has(.m-radio-card-input:focus-visible) { outline: 2px solid var(--brand-action); outline-offset: 3px; }
.m-radio-card-group:disabled .m-radio-card { cursor: not-allowed; opacity: .55; }
.is-trailing .m-radio-card-legend { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.is-trailing .m-radio-card { min-height: 58px; padding: 0 16px 0 18px; border: 0; border-radius: 16px; box-shadow: 0 3px 12px rgba(48, 37, 31, .05); }
.is-trailing .m-radio-card.is-selected { border: 1px solid var(--brand-action); }
.is-trailing .m-radio-card-dot { order: 1; width: 18px; height: 18px; margin-left: auto; }
.is-trailing .m-radio-card-label { font-size: 15px; line-height: 22px; font-weight: 500; }
</style>
