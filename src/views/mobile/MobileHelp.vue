<script setup>
import { inject, onBeforeUnmount, onMounted } from 'vue';
import { classicAssets } from '../../constants/classicAssets.js';

const headerTone = inject('mobileHeaderTone', null);
const socials = [
  { name: 'Facebook', href: 'https://www.facebook.com/share/18v7fhWTYX/?mibextid=wwXIfr', icon: 'facebook' },
  { name: 'Instagram', href: 'https://www.instagram.com/ferjoooooo/', icon: 'instagram' },
  { name: '小红书', href: 'https://xhslink.cn/o/71W7wzdhmIV', icon: 'xiaohongshu' }
];
const support = [
  { to: '/me/help/faq', label: '常见问题', icon: 'question' },
  { to: '/me/help/feedback', label: '意见反馈', icon: 'chat' }
];
onMounted(() => { if (headerTone) headerTone.value = 'settings'; });
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
</script>
<template>
<main class="m-page help-page">
  <section class="brand">
    <img class="about-logo" :src="classicAssets.logoBrand" alt="Ferjoo" width="112" height="112" />
    <p class="tagline">Ferment with joy.</p>
    <div class="about-socials" aria-label="关注 Ferjoo">
      <a v-for="social in socials" :key="social.name" class="about-social" :href="social.href" target="_blank" rel="noopener noreferrer">
        <span class="social-disc" aria-hidden="true">
          <svg v-if="social.icon === 'facebook'" viewBox="0 0 24 24"><path d="M13.7 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.5v3h2.8v8h3.4Z"/></svg>
          <svg v-else-if="social.icon === 'instagram'" viewBox="0 0 24 24"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" ry="5.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.8" r="1.1"/></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M5.2 4.2h13.6A2.2 2.2 0 0 1 21 6.4v11.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 17.6V6.4a2.2 2.2 0 0 1 2.2-2.2Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 8h3.5v2H9.4v5.8H7V8Zm4.5 0h2.3l1.2 2.2L16.2 8h2.3l-2.3 3.7 2.5 4.1h-2.4L15 13.3l-1.4 2.5h-2.4l2.6-4.1L11.5 8Z"/></svg>
        </span>
        <span>{{ social.name }}</span>
      </a>
    </div>
  </section>

  <p class="group-label">帮助与支持</p>
  <nav class="m-card help-links" aria-label="帮助与支持">
    <RouterLink v-for="item in support" :key="item.to" :to="item.to">
      <span class="row-icon" aria-hidden="true">
        <svg v-if="item.icon === 'question'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.5 1-1.5 1.9V14" /><path d="M12 17h.01" /></svg>
        <svg v-else viewBox="0 0 24 24"><path d="M8 17.5 4.5 19V7.2A2.2 2.2 0 0 1 6.7 5h10.6a2.2 2.2 0 0 1 2.2 2.2V15a2.2 2.2 0 0 1-2.2 2.2H8Z" /><path d="M8 9.5h8M8 13h5" /></svg>
      </span>
      <span>{{ item.label }}</span>
      <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </RouterLink>
  </nav>

  <p class="group-label">产品信息</p>
  <nav class="m-card help-links" aria-label="产品信息">
    <RouterLink to="/me/help/privacy">
      <span class="row-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3.5 5.5 6v5.2c0 4.2 2.7 7.2 6.5 8.8 3.8-1.6 6.5-4.6 6.5-8.8V6L12 3.5Z" /><path d="m9 12 2 2 4-4" /></svg></span>
      <span>隐私与权限</span>
      <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </RouterLink>
  </nav>
  <p class="footnote">陪你记录养护日常，看见每一次变化。</p>
</main>
</template>
<style scoped>
.mobile-area .m-page.help-page{padding-top:12px;gap:0}
.brand{display:grid;justify-items:center}
.about-logo{width:112px;height:112px;object-fit:contain}
.tagline{margin:12px 0 0;color:var(--text-primary);font-size:var(--text-sm);line-height:21px;text-align:center}
.about-socials{display:flex;justify-content:center;gap:12px;margin-top:12px}
.about-social{display:grid;justify-items:center;align-content:start;gap:6px;width:88px;min-height:80px;color:inherit;text-decoration:none;font-size:var(--text-xs);line-height:18px}
.social-disc{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--m-icon-disc);color:var(--brand-action)}
.social-disc svg{width:24px;height:24px;fill:currentColor}
.group-label{margin:24px 0 12px;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
.help-links{display:grid;padding:0 16px}
.help-links a{position:relative;display:flex;align-items:center;gap:12px;min-height:68px;color:inherit;text-decoration:none;font-size:var(--text-md);font-weight:500;line-height:24px}
.help-links a + a::before{content:'';position:absolute;top:0;left:52px;right:0;height:1px;background:var(--border-warm)}
.row-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;background:var(--m-icon-disc);color:var(--brand-action)}
.row-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.help-links a span:nth-child(2){flex:1}
.chevron{flex:none;width:20px;height:20px;fill:none;stroke:var(--text-secondary);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.footnote{margin:24px 0 0;color:var(--text-secondary);font-size:var(--text-xs);line-height:18px}
</style>
