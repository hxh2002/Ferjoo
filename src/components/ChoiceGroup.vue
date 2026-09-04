<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, required: true },
  label: { type: String, required: true },
  hint: { type: String, default: '' }
});
defineEmits(['update:modelValue']);
</script>

<template>
  <fieldset class="field-block">
    <legend>
      <span>{{ label }}</span>
      <small v-if="hint">{{ hint }}</small>
    </legend>
    <div class="choice-grid">
      <button
        v-for="item in options"
        :key="item.value"
        class="choice-card"
        :class="{ selected: item.value === modelValue }"
        type="button"
        @click="$emit('update:modelValue', item.value)"
      >
        <span class="choice-dot"></span>
        <span class="choice-copy">
          <strong>{{ item.label }}</strong>
          <small v-if="item.description">{{ item.description }}</small>
        </span>
      </button>
    </div>
  </fieldset>
</template>
