<script setup>
import { ref } from 'vue';
import { submitFeedback } from '../../services/feedback.service.js';
import MToast from '../../components/mobile/MToast.vue';

const content = ref('');
const contact = ref('');
const error = ref('');
const toast = ref('');
const tone = ref('error');
const busy = ref(false);

async function submit() {
  error.value = '';
  toast.value = '';
  if (!content.value.trim()) {
    error.value = '请填写反馈内容';
    tone.value = 'error';
    toast.value = '请填写反馈内容';
    return;
  }
  busy.value = true;
  try {
    await submitFeedback({ content: content.value.trim(), contact: contact.value.trim() });
    content.value = '';
    contact.value = '';
    tone.value = 'success';
    toast.value = '反馈已提交';
  } catch (cause) {
    tone.value = 'error';
    toast.value = cause?.message || '暂时无法提交，请稍后再试。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="m-page">
    <h1>意见反馈</h1>
    <form class="m-card" @submit.prevent="submit">
      <label>反馈内容<textarea v-model="content" rows="6" aria-describedby="feedback-error" /></label>
      <p v-if="error" id="feedback-error" class="m-error" role="alert">{{ error }}</p>
      <label>联系方式<input v-model="contact" autocomplete="email" placeholder="选填" /></label>
      <button class="m-primary" :disabled="busy">{{ busy ? '提交中…' : '提交反馈' }}</button>
    </form>
    <MToast :open="!!toast" :message="toast" :tone="tone" @close="toast = ''" />
  </main>
</template>

<style scoped>
h1{margin:0;font-size:28px;line-height:36px;font-weight:500}
label{display:grid;gap:8px;font-size:var(--text-sm)}
.m-primary{width:100%;min-height:60px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary)}
</style>
