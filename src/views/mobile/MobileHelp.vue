<script setup>
import { inject, onBeforeUnmount, onMounted } from 'vue';
import aboutLogo from '../../assets/about/brand-logo-circle.png';
import socialFacebook from '../../assets/about/social-facebook.svg';
import socialInstagram from '../../assets/about/social-instagram.svg';
import socialXiaohongshu from '../../assets/about/social-xiaohongshu.svg';

const headerTone = inject('mobileHeaderTone', null);
const socials = [
  { name: 'Facebook', href: 'https://www.facebook.com/share/18v7fhWTYX/?mibextid=wwXIfr', icon: socialFacebook },
  { name: 'Instagram', href: 'https://www.instagram.com/ferjoooooo/', icon: socialInstagram },
  { name: '小红书', href: 'https://xhslink.cn/o/71W7wzdhmIV', icon: socialXiaohongshu }
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
    <img class="about-logo" :src="aboutLogo" alt="Ferjoo" width="112" height="112" />
    <p class="tagline">Ferment with joy.</p>
    <div class="about-socials" aria-label="关注 Ferjoo">
      <a v-for="social in socials" :key="social.name" class="about-social" :href="social.href" target="_blank" rel="noopener noreferrer">
        <span class="social-disc" aria-hidden="true">
          <img :src="social.icon" alt="" width="24" height="24" />
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
/* `.m-page > *` 会把这些 margin 归零（全局 reset 的选择器层级高于 scoped 单类），
   页头 → 分组标题 24、标题 → 卡片 12、卡片 → 下个标题 24 的层级因此全变成 0，文字紧贴。 */
.mobile-area .mobile-main .m-page.help-page > .group-label{margin-block:24px 12px}
.mobile-area .mobile-main .m-page.help-page > .footnote{margin-block:24px 0}
.brand{display:grid;justify-items:center}
.about-logo{width:112px;height:112px;border-radius:56px;object-fit:cover}
.tagline{margin:12px 0 0;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px;text-align:center}
.about-socials{display:flex;justify-content:center;gap:12px;margin-top:12px}
.about-social{display:grid;justify-items:center;align-content:start;gap:6px;width:88px;min-height:80px;color:inherit;text-decoration:none;font-size:var(--text-xs);line-height:18px}
.social-disc{display:grid;place-items:center;width:56px;height:56px;border-radius:28px;background:var(--m-disc);color:var(--brand-action)}
.social-disc img{display:block;width:24px;height:24px}
.group-label{margin:24px 0 12px;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
.mobile-area .m-page.help-page .help-links{display:grid;padding:0 16px;border:0;box-shadow:var(--m-shadow-button)}
.help-links a{position:relative;display:flex;align-items:center;gap:12px;min-height:68px;color:inherit;text-decoration:none;font-size:var(--text-md);font-weight:500;line-height:24px}
.help-links a + a::before{content:'';position:absolute;top:0;left:52px;right:0;height:1px;background:var(--border-warm)}
.row-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:20px;background:var(--m-disc);color:var(--brand-action)}
.row-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.help-links a span:nth-child(2){flex:1}
.chevron{flex:none;width:20px;height:20px;fill:none;stroke:var(--brand-action);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.footnote{margin:24px 0 0;color:var(--text-secondary);font-size:var(--text-xs);line-height:18px;text-align:center}
</style>
