<script setup>
import { onBeforeUnmount, onMounted } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '详情' }
});
const emit = defineEmits(['close']);

function onKey(event) {
  if (event.key === 'Escape' && props.open) emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Transition name="admin-drawer">
    <div v-if="open" class="admin-drawer-layer" @click.self="emit('close')">
      <aside class="admin-drawer" role="dialog" aria-modal="true" :aria-label="title">
        <header class="admin-drawer-head">
          <h2>{{ title }}</h2>
          <button type="button" @click="emit('close')">关闭</button>
        </header>
        <slot />
      </aside>
    </div>
  </Transition>
</template>
