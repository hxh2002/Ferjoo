<script setup>
import { onMounted, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import MToast from '../../components/mobile/MToast.vue';

const auth = useAuth();
const toast = ref('');
const toastTone = ref('success');
onMounted(() => auth.init());
async function copy() {
  try {
    await navigator.clipboard.writeText(auth.profile.value.invite_code);
    toastTone.value = 'success';
    toast.value = '邀请码已复制';
  } catch {
    toastTone.value = 'error';
    toast.value = '复制失败，请长按邀请码复制。';
  }
}
</script>

<template>
  <main class="m-page invite-page">
    <header class="invite-head"><h1>我的邀请码</h1></header>
    <section class="m-card">
      <p class="code">{{ auth.profile.value?.invite_code || '正在读取…' }}</p>
      <button class="m-secondary" :disabled="!auth.profile.value?.invite_code" @click="copy">复制邀请码</button>
      <p class="quota">已邀请 {{ auth.profile.value?.invited_count ?? 0 }} / {{ auth.profile.value?.invite_quota ?? 1 }} 人</p>
      <p class="m-muted">好友注册时填写此邀请码，不会共享你的记录或设备。</p>
    </section>
    <MToast :open="!!toast" :message="toast" :tone="toastTone" @close="toast = ''" />
  </main>
</template>

<style scoped>
.invite-head h1{margin:0 0 14px;font-size:28px;line-height:36px;font-weight:500}
.code{margin:0 0 12px;font-size:28px;line-height:36px;font-weight:500;overflow-wrap:anywhere;user-select:all}
.quota{margin:14px 0 8px;color:var(--text-primary);font-size:var(--text-md);line-height:24px}
</style>
