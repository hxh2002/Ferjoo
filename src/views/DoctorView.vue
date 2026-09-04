<script setup>
import { ref } from 'vue';
import DiagnosisForm from '../components/DiagnosisForm.vue';
import DiagnosisResult from '../components/DiagnosisResult.vue';

const result = ref(null);
</script>

<template>
  <section class="hero">
    <div>
      <p class="eyebrow">Traceable Fermentation Intelligence</p>
      <h1>把每一次发酵，变成可解释、可追踪的数据。</h1>
      <p>
        诊断算法保留 2,016 种有限组合审计，并将温度、时间、体积状态与文献证据分层处理。
        登录后还可以绑定设备并保存 10 分钟分辨率历史数据。
      </p>
    </div>
    <div class="hero-stat">
      <strong>2,016</strong>
      <span>核心组合全量审计</span>
    </div>
  </section>

  <div class="doctor-grid">
    <DiagnosisForm @diagnosed="result = $event" />
    <DiagnosisResult :result="result" />
  </div>
</template>
