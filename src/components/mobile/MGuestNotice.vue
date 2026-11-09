// 游客空态统一组件：设备首页 / 日记 / 数据详情 / 轮次选择 / 诊断链路 / 记录喂养共用同一套结构，
// 避免各页各写一份插画、文案与跳转。跳转目标由调用方用 lib/mobile-guest.js 生成，天然带上 redirect 回跳。
<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  action: { type: String, default: '去登录' },
  // 只在需要强调注册的分流页打开；其余页面保持单按钮，减少选择成本。
  register: { type: Boolean, default: false },
  // hero 用于一级页面整屏引导（设备首页）：大插画 + 标题 + 注册入口。
  hero: { type: Boolean, default: false },
  // compact 贴在已有卡片流里（如诊断步骤上方），不额外撑大页面，也不再重复大插画。
  compact: { type: Boolean, default: false },
  // 已由调用方算好的路由目标；组件本身不依赖 useRoute，SSR 与单测可直接渲染。
  loginTo: { type: Object, required: true },
  registerTo: { type: Object, default: null },
  mascot: { type: String, default: '/assets/jojo1.png' }
});
</script>

<template>
  <section class="m-guest-notice" :class="{ 'is-compact': compact, 'is-hero': hero }" data-testid="guest-notice">
    <p v-if="eyebrow" class="guest-eyebrow">{{ eyebrow }}</p>
    <img v-if="mascot && !compact" class="guest-mascot" :src="mascot" alt="Jojo 吉祥物" width="76" height="76" />
    <div class="guest-copy">
      <!-- hero 所在页面已有自己的一级标题（我的设备），这里降为二级 heading，避免同屏两个 h1。
           不用 h2 元素：全局 `.m-page h2`（20px / 600）会盖过本组件的 28px 标题样式。 -->
      <component :is="hero ? 'div' : 'strong'" class="guest-title" :role="hero ? 'heading' : undefined" :aria-level="hero ? 2 : undefined">{{ title }}</component>
      <p v-if="description">{{ description }}</p>
    </div>
    <div class="guest-actions">
      <RouterLink class="guest-primary" :to="loginTo">{{ action }}</RouterLink>
      <RouterLink v-if="register && registerTo" class="guest-secondary" :to="registerTo">邀请码注册</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.m-guest-notice{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;padding:16px;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:var(--m-shadow-button)}
.m-guest-notice.is-hero{display:block;padding:var(--m-card-space);text-align:center}
.m-guest-notice.is-compact{display:flex;gap:10px;padding:12px 14px;border-radius:var(--radius-control);background:var(--m-safety-bg);box-shadow:none}
.guest-eyebrow{margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.1em;color:var(--brand-action)}
.guest-mascot{flex:none;object-fit:contain}
.is-hero .guest-mascot{width:min(52vw,190px);height:auto;margin:.2rem auto .85rem}
.guest-copy{display:grid;gap:4px;min-width:0}
.guest-title{margin:0;font-size:15px;line-height:22px;font-weight:500;color:var(--text-primary)}
.is-hero .guest-title{font-size:28px;line-height:36px;letter-spacing:-.02em;margin-bottom:8px}
.guest-copy p{margin:0;font-size:13px;line-height:19px;color:var(--text-secondary)}
.is-hero .guest-copy p{margin-top:6px}
.is-compact .guest-title{font-size:13px;line-height:19px}
.is-compact .guest-copy p{font-size:12px;line-height:18px}
.m-guest-notice .guest-actions{grid-column:1 / -1;display:grid;gap:8px;margin-top:4px}
.is-hero .guest-actions{margin-top:12px}
.is-compact .guest-actions{grid-column:auto;flex:none;display:flex;align-items:center;gap:8px;margin:0 0 0 auto}
.guest-primary{display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 16px;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font-size:15px;font-weight:500;text-decoration:none}
.is-compact .guest-primary{min-height:32px;padding:0 12px;border-radius:16px;font-size:13px}
.guest-secondary{display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid var(--border-warm);border-radius:var(--radius-control);background:var(--surface-card);color:var(--text-primary);font-size:14px;font-weight:500;text-decoration:none}
.is-hero .guest-secondary{border:0;background:transparent;color:var(--m-text-link);font-size:13px}
@media (max-width:360px){.m-guest-notice:not(.is-compact){grid-template-columns:minmax(0,1fr)}}
</style>
