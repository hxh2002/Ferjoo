<script setup>
defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, required: true },
  columns: { type: Number, default: 3 }
});
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <div class="choice-grid" :style="{ '--choice-columns': columns }">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="choice"
      :class="{ selected: modelValue === option.value }"
      @click="emit('update:modelValue', option.value)"
    >
      <span>{{ option.label }}</span>
      <small v-if="option.note">{{ option.note }}</small>
    </button>
  </div>
</template>
