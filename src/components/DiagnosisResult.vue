<script setup>
import ReferenceList from './ReferenceList.vue';

defineProps({
  result: { type: Object, default: null }
});

const labels = {
  ok: '良好',
  warn: '需注意',
  danger: '需处理',
  info: '观察'
};
</script>

<template>
  <section class="panel result-panel">
    <div v-if="!result" class="empty-state">
      <span class="empty-icon">↗</span>
      <h2>等待诊断</h2>
      <p>填写左侧信息后，诊断结果、翻倍预测、操作建议和参考文献会显示在这里。</p>
    </div>

    <template v-else>
      <div class="result-heading">
        <span class="status-badge" :class="result.level">{{ labels[result.level] || result.level }}</span>
        <div>
          <p class="eyebrow">当前判断</p>
          <h2>{{ result.state }}</h2>
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric"><span>阶段</span><strong>{{ result.stageLabel }}</strong></div>
        <div class="metric"><span>比例</span><strong>{{ result.ratioLabel }}</strong></div>
        <div class="metric"><span>温度</span><strong>{{ result.tempLabel }}</strong></div>
        <div class="metric"><span>翻倍预测</span><strong>{{ result.expectedHours }}</strong></div>
      </div>

      <div v-if="result.timing" class="insight-card">
        <strong>时间模型</strong>
        <p>
          {{ result.timing.display }}
          <template v-if="result.timing.confidence"> · 置信度 {{ result.timing.confidence }}</template>
        </p>
      </div>

      <div v-if="result.phAssessment" class="insight-card">
        <strong>pH 辅助</strong>
        <p>{{ result.phAssessment.message }}</p>
      </div>

      <section class="result-section">
        <h3>原因分析</h3>
        <ul><li v-for="item in result.reasons" :key="item">{{ item }}</li></ul>
      </section>

      <section class="result-section">
        <h3>操作建议</h3>
        <ul><li v-for="item in result.actions" :key="item">{{ item }}</li></ul>
      </section>

      <section v-if="result.safety?.length" class="result-section safety-box">
        <h3>安全提醒</h3>
        <ul><li v-for="item in result.safety" :key="item">{{ item }}</li></ul>
      </section>

      <ReferenceList :citations="result.citations || []" />
    </template>
  </section>
</template>
