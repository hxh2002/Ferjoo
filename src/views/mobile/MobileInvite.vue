<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import MToast from '../../components/mobile/MToast.vue';

const auth = useAuth();
const headerTone = inject('mobileHeaderTone', null);
const toast = ref('');
const toastTone = ref('success');
const invited = computed(() => Number(auth.profile.value?.invited_count) || 0);
const quota = computed(() => {
  const value = auth.profile.value?.invite_quota;
  return value == null ? 1 : Math.max(0, Number(value) || 0);
});
const remaining = computed(() => Math.max(0, quota.value - invited.value));
const progress = computed(() => quota.value > 0 ? Math.min(100, (invited.value / quota.value) * 100) : 0);
onMounted(() => { if (headerTone) headerTone.value = 'settings'; auth.init(); });
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
async function copy() {
  const code = auth.profile.value?.invite_code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
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
    <p class="group-label">专属邀请码</p>
    <button class="ticket" type="button" :disabled="!auth.profile.value?.invite_code" @click="copy">
      <span class="code">{{ auth.profile.value?.invite_code || '正在读取…' }}</span>
      <span class="ticket-line" aria-hidden="true"></span>
      <span class="copy-row">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        点击复制邀请码
      </span>
    </button>
    <p class="group-label">邀请进度</p>
    <section class="progress-card">
      <p class="progress-row"><span>已邀请 {{ invited }} 人</span><span>上限 {{ quota }} 人</span></p>
      <span class="bar" aria-hidden="true"><span :style="{ width: `${progress}%` }"></span></span>
      <p class="remaining">还可邀请 {{ remaining }} 人</p>
    </section>
    <p class="note-title">邀请说明</p>
    <p class="note">默认可邀请 1 人。如需增加名额，请联系管理员。</p>
    <MToast :open="!!toast" :message="toast" :tone="toastTone" @close="toast = ''" />
  </main>
</template>

<style scoped>
.mobile-area .m-page.invite-page{padding-top:16px}
.group-label{margin:0 0 8px;color:var(--text-secondary);font-size:14px;line-height:21px}
/* 本页 gap 16：分组标签被上下各 16 夹住，「专属邀请码」和卡片一视同仁，看不出谁是标题。
   `.m-page > *` 的 margin-block 归零也吃掉了原来的 `0 0 8px`，这里写回上 24 / 下 16，
   首条标签不计上边距，页面顶部仍保持 16。 */
.mobile-area .mobile-main .m-page.invite-page > .group-label{margin-block:8px 0}
.mobile-area .mobile-main .m-page.invite-page > .group-label:first-child{margin-block:0}
.ticket{position:relative;display:flex;flex-direction:column;gap:12px;width:100%;min-height:140px;margin:0 0 24px;padding:16px 24px 15px;border:0;border-radius:16px;background:var(--brand-light);color:var(--text-primary);cursor:pointer;overflow:visible}
.ticket::before,.ticket::after{content:'';position:absolute;top:50%;width:18px;height:18px;border-radius:50%;background:var(--surface-page);transform:translateY(-50%)}
.ticket::before{left:-9px}
.ticket::after{right:-9px}
.ticket:disabled{cursor:default}
.code{font-size:36px;line-height:48px;font-weight:500;letter-spacing:2px;text-align:center;overflow-wrap:anywhere;user-select:all}
.ticket-line{height:1px;background:repeating-linear-gradient(90deg, color-mix(in srgb, var(--text-primary) 28%, transparent) 0 4px, transparent 4px 8px)}
.copy-row{display:flex;align-items:center;justify-content:center;gap:8px;min-height:36px;font-size:14px;line-height:21px;font-weight:500}
.progress-card{display:grid;gap:12px;margin:0 0 24px;padding:20px;border-radius:20px;background:var(--surface-card);box-shadow:0 4px 16px rgba(48,37,31,.06)}
.progress-row{display:flex;justify-content:space-between;gap:12px;margin:0;font-size:14px;line-height:21px}
.progress-row span:last-child{color:var(--text-secondary);text-align:right}
.bar{display:block;height:8px;border-radius:4px;background:var(--border-warm);overflow:hidden}
.bar span{display:block;height:100%;border-radius:4px;background:var(--brand-action)}
.remaining{margin:0;color:var(--brand-primary);font-size:16px;line-height:24px;font-weight:500}
.note-title{margin:0 0 8px;font-size:14px;line-height:21px;font-weight:500}
.note{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px}
</style>
