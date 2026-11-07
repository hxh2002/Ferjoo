<script setup>
import { inject, onBeforeUnmount, onMounted, ref } from 'vue';

const headerTone = inject('mobileHeaderTone', null);
// 文案与分组顺序取自 Figma 182:1361 / 182:1476 / 182:1501。
const items = [
  {
    id: 'profile',
    title: '如何修改个人资料？',
    paragraphs: [
      '打开“我的 → 个人资料”，点击“编辑资料”。',
      '可统一修改头像、用户名、性别和出生日期，完成后点击“保存资料”。账号 ID 和注册时间由系统生成，不可修改。'
    ]
  },
  {
    id: 'invite',
    title: '在哪里查看邀请名额？',
    paragraphs: [
      '1. 打开“我的 → 个人资料 → 我的邀请码”。',
      '2. 在“邀请进度”查看已邀请人数、邀请上限与剩余名额。',
      '3. 点击“复制邀请码”，分享给朋友，供注册时填写。',
      '新用户默认可邀请 1 人。名额用完后，如需增加，请联系管理员。'
    ]
  },
  {
    id: 'notify',
    title: '为什么没有收到提醒？',
    paragraphs: [
      '请依次检查以下设置：',
      '1. 在手机系统设置中，允许 Ferjoo 发送通知。',
      '2. 在“我的 → 通知设置”中，开启对应提醒。',
      '3. 确认已设置喂养时间或高度提醒条件。',
      '4. 检查手机的勿扰、专注模式及通知摘要设置。',
      '设备类提醒还需确认设备已连接。通知声音与展示方式由手机系统管理。'
    ]
  }
];
const open = ref(['profile']);
function toggle(id) {
  open.value = open.value.includes(id) ? open.value.filter((item) => item !== id) : [...open.value, id];
}
onMounted(() => { if (headerTone) headerTone.value = 'settings'; });
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
</script>

<template>
  <main class="m-page faq-page">
    <section class="faq-card">
      <div v-for="item in items" :key="item.id" class="faq-item">
        <button type="button" class="faq-question" :aria-expanded="open.includes(item.id)" @click="toggle(item.id)">
          <span class="faq-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.5 1-1.5 1.9V14" /><path d="M12 17h.01" /></svg>
          </span>
          <span class="faq-title">{{ item.title }}</span>
          <svg class="faq-chevron" :class="{ 'is-open': open.includes(item.id) }" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <div v-if="open.includes(item.id)" class="faq-answer">
          <p v-for="(paragraph, index) in item.paragraphs" :key="index">{{ paragraph }}</p>
        </div>
      </div>
    </section>
    <div class="faq-more">
      <p>没有找到答案？</p>
      <RouterLink to="/me/help/feedback">提交意见反馈</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.mobile-area .m-page.faq-page{padding-top:16px;gap:24px}
.faq-card{background:var(--surface-card);border-radius:var(--radius-card);box-shadow:var(--m-shadow-button);overflow:hidden}
.faq-item{position:relative}
.faq-item + .faq-item::before{content:'';position:absolute;top:0;left:68px;right:16px;height:1px;background:var(--border-warm)}
.faq-question{display:flex;align-items:center;gap:12px;width:100%;min-height:76px;padding:0 16px;border:0;background:transparent;color:var(--text-primary);text-align:left;cursor:pointer}
.faq-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;color:var(--brand-action)}
.faq-icon svg,.faq-chevron{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.faq-icon svg{width:24px;height:24px}
.faq-title{flex:1;min-width:0;font-size:16px;line-height:24px;font-weight:400}
.faq-chevron{flex:none;width:20px;height:20px;color:var(--brand-action);transition:transform var(--motion-fast) ease}
.faq-chevron.is-open{transform:rotate(180deg)}
.faq-answer{padding:0 16px 20px 68px}
.faq-answer p{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px}
.faq-answer p + p{margin-top:8px}
.faq-more{display:grid;justify-items:center;gap:8px;text-align:center}
.faq-more p{margin:0;color:var(--text-secondary);font-size:12px;line-height:18px}
.faq-more a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;color:var(--brand-action);font-size:14px;line-height:21px;text-decoration:none}
@media (prefers-reduced-motion: reduce) {
  .faq-chevron{transition:none}
}
</style>
