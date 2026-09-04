<script setup>
defineProps({
  citations: { type: Array, default: () => [] }
});
</script>

<template>
  <div class="references" v-if="citations.length">
    <h4>参考与证据</h4>
    <article v-for="ref in citations" :key="ref.key" class="reference-row">
      <div>
        <span class="reference-kind">{{ ref.kind || (ref.public === false ? 'Ferjoo 经验先验' : ref.type) }}</span>
        <strong>{{ ref.title || ref.citation || ref.key }}</strong>
        <p v-if="ref.displayNote">{{ ref.displayNote }}</p>
      </div>
      <a v-if="ref.url" :href="ref.url" target="_blank" rel="noreferrer">SOURCE ↗</a>
      <span v-else class="internal-ref">INTERNAL</span>
    </article>
  </div>
</template>
