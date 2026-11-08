<script setup>
import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { submitFeedback } from '../../services/feedback.service.js';
import MToast from '../../components/mobile/MToast.vue';

const headerTone = inject('mobileHeaderTone', null);
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
    const saved = await submitFeedback({ content: content.value.trim(), contact: contact.value.trim() });
    if (!saved?.id) throw new Error('暂时无法提交，请稍后再试。');
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
onMounted(() => { if (headerTone) headerTone.value = 'settings'; });
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
</script>

<template>
  <main class="m-page feedback-page">
    <form @submit.prevent="submit">
      <label>问题与建议
        <textarea v-model="content" maxlength="500" placeholder="请描述遇到的问题或你的建议" aria-describedby="feedback-error feedback-count" />
        <span id="feedback-count" class="count">{{ content.length }} / 500</span>
      </label>
      <p v-if="error" id="feedback-error" class="m-error" role="alert">{{ error }}</p>
      <label>联系方式（选填）<input v-model="contact" autocomplete="email" placeholder="填写邮箱，方便我们回复" /></label>
      <p class="privacy-note">请勿填写密码或其他敏感信息。</p>
      <button class="m-primary" :disabled="busy">{{ busy ? '提交中…' : '提交反馈' }}</button>
    </form>
    <MToast :open="!!toast" :message="toast" :tone="tone" @close="toast = ''" />
  </main>
</template>

<style scoped>
.mobile-area .m-page.feedback-page{min-height:calc(100dvh - 128px);padding-top:16px}
form{display:flex;flex:1;flex-direction:column;gap:24px}
label{display:grid;gap:8px;color:var(--text-secondary);font-size:14px;line-height:21px;font-weight:400}
.mobile-area .feedback-page textarea,.mobile-area .feedback-page input{border:0;border-radius:20px;background:var(--surface-card);box-shadow:var(--m-shadow-field);color:var(--text-primary)}
.mobile-area .feedback-page textarea{height:180px;min-height:180px;padding:16px;font-size:16px;line-height:21px;resize:none}
/* 输入框字号必须 ≥16px：iOS Safari 对 <16px 的输入框在 focus 时会自动放大页面，且不会自动缩回。 */
.mobile-area .feedback-page input{height:64px;min-height:64px;padding:0 16px;font-size:16px;line-height:21px}
.feedback-page :is(textarea,input)::placeholder{color:var(--m-placeholder)}
.count,.privacy-note{color:var(--text-secondary);font-size:12px;line-height:18px;font-weight:400}
.count{text-align:right}
.privacy-note{margin:0}
.m-primary{width:100%;margin-top:auto;min-height:60px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);box-shadow:var(--m-shadow-button)}
</style>
