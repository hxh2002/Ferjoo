<script setup>
defineProps({
  citations: { type: Array, default: () => [] }
});
</script>

<template>
  <section v-if="citations.length" class="result-section">
    <h3>参考文献</h3>
    <div class="reference-list">
      <article
        v-for="item in citations.filter((x) => x && x.public !== false && x.type !== 'unresolved')"
        :key="item.key"
        class="reference-card"
      >
        <div class="reference-meta">
          <span>{{ item.kind || '资料' }}</span>
          <span>{{ [item.authorsShort, item.source, item.year].filter(Boolean).join(' · ') }}</span>
        </div>
        <strong>{{ item.title || item.citation || item.key }}</strong>
        <p v-if="item.displayNote">{{ item.displayNote }}</p>
        <a v-if="item.url" :href="item.url" target="_blank" rel="noopener noreferrer">查看原文 ↗</a>
      </article>
    </div>
  </section>
</template>
