<script setup>
import { ref } from 'vue';
import { formatAdvice } from '../services/diagnosis.service.js';
import ReferenceList from './ReferenceList.vue';

const props = defineProps({
  result: { type: Object, default: null }
});

const copied = ref(false);

async function copyReport() {
  if (!props.result) return;
  const text = formatAdvice(props.result);
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <section class="panel result-panel">
    <div v-if="!result" class="result-empty">
      <div class="doctor-orbit" aria-hidden="true">
        <span class="orbit-ring ring-a"></span>
        <span class="orbit-ring ring-b"></span>
        <div class="starter-jar">
          <span class="jar-bubbles">•••</span>
          <span class="jar-line"></span>
        </div>
      </div>
      <p class="eyebrow dark">YOUR FERMENTATION, EXPLAINED</p>
      <h2>把今天的状态告诉我。</h2>
      <p>完成左侧输入后，我会给出当前判断、预计剩余时间、下一步动作与证据来源。</p>
      <div class="empty-stats">
        <span><strong>6</strong> 阶段</span>
        <span><strong>6</strong> 比例</span>
        <span><strong>2016</strong> 基础组合</span>
      </div>
    </div>

    <div v-else class="result-content">
      <div class="result-topline">
        <span class="status-badge" :class="`tone-${result.tone}`">{{ result.badge }}</span>
        <button class="copy-button" type="button" @click="copyReport">{{ copied ? 'COPIED' : 'COPY REPORT' }}</button>
      </div>

      <h2>{{ result.title }}</h2>
      <p class="result-subtitle">{{ result.subtitle }}</p>

      <div class="metric-grid">
        <div v-for="metric in result.metrics" :key="metric.label" class="metric-card">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </div>
      </div>

      <div class="insight-card timing-card">
        <span class="insight-kicker">FERMENTATION CLOCK</span>
        <strong>{{ result.timing.display }}</strong>
        <p v-if="result.expected?.baseAt25to28">25–28°C 下的比例经验先验：{{ result.expected.baseAt25to28 }}</p>
      </div>

      <div class="advice-grid">
        <section class="advice-card">
          <span class="insight-kicker">WHY</span>
          <h3>为什么这样判断</h3>
          <ul>
            <li v-for="item in result.reasons" :key="item">
              <span class="reason-dot" aria-hidden="true"></span>
              <p>{{ item }}</p>
            </li>
          </ul>
        </section>
        <section class="advice-card advice-actions">
          <span class="insight-kicker">NEXT STEPS</span>
          <h3>下一步怎么做</h3>
          <ol>
            <li v-for="(item, index) in result.actions" :key="item">
              <span class="step-num" aria-hidden="true">{{ index + 1 }}</span>
              <p>{{ item }}</p>
            </li>
          </ol>
        </section>
      </div>

      <ReferenceList :citations="result.citations" />

      <div class="insight-card">
        <span class="insight-kicker">ACIDITY</span>
        <strong>{{ result.ph.label }}</strong>
        <p>{{ result.ph.message }}</p>
      </div>

      <details class="trace-details">
        <summary>查看本次规则追踪</summary>
        <pre>{{ JSON.stringify(result.trace, null, 2) }}</pre>
      </details>
    </div>
  </section>
</template>
