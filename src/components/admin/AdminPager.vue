<script setup>
const props = defineProps({
  page: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  pageSize: { type: Number, required: true }
});
const emit = defineEmits(['page']);
function pages() {
  return Math.max(1, Math.ceil(props.total / props.pageSize));
}
</script>

<template>
  <div v-if="total > pageSize" class="admin-pager">
    <button type="button" class="m-secondary" :disabled="page === 0" @click="emit('page', page - 1)">上一页</button>
    <span>第 {{ page + 1 }} / {{ pages() }} 页 · 共 {{ total }} 条</span>
    <button type="button" class="m-secondary" :disabled="(page + 1) * pageSize >= total" @click="emit('page', page + 1)">下一页</button>
  </div>
  <p v-else-if="total" class="admin-note">共 {{ total }} 条</p>
</template>
