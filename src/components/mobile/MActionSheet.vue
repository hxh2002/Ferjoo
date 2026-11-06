<script setup>
import MSheet from './MSheet.vue';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  actions: { type: Array, required: true }, // [{ value, label, description?, danger?, disabled? }]
  cancelLabel: { type: String, default: '取消' }
});
const emit = defineEmits(['close', 'select']);
</script>

<template>
  <MSheet :open="open" :title="title" @close="emit('close')">
    <div class="m-action-sheet-list">
      <button
        v-for="action in actions"
        :key="action.value"
        type="button"
        class="m-action-sheet-item"
        :class="{ 'is-danger': action.danger }"
        :disabled="action.disabled"
        @click="emit('select', action.value)"
      >
        <span>{{ action.label }}</span>
        <small v-if="action.description">{{ action.description }}</small>
      </button>
    </div>
    <template #footer>
      <button type="button" class="m-action-sheet-cancel" @click="emit('close')">{{ cancelLabel }}</button>
    </template>
  </MSheet>
</template>

<style scoped>
.m-action-sheet-list { overflow: hidden; border: 1px solid var(--border-warm); border-radius: var(--radius-card); background: var(--surface-card); }
.m-action-sheet-item { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; width: 100%; min-height: 56px; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--border-warm); background: transparent; color: var(--text-primary); font-size: var(--text-md); text-align: left; cursor: pointer; }
.m-action-sheet-item:last-child { border-bottom: 0; }
.m-action-sheet-item small { color: var(--text-secondary); font-size: var(--text-xs); line-height: 18px; }
.m-action-sheet-item.is-danger { color: var(--danger-text); background: var(--danger-bg); }
.m-action-sheet-cancel { width: 100%; min-height: 48px; border: 1px solid var(--border-warm); border-radius: var(--m-radius-button); background: var(--surface-card); color: var(--text-primary); font-weight: 500; cursor: pointer; }
</style>
