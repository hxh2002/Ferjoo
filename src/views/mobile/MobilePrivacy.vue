<script setup>
import { inject, onBeforeUnmount, onMounted } from 'vue';

const headerTone = inject('mobileHeaderTone', null);
// 结构与文案取自 Figma 182:1410「隐私与权限」。
const permissions = [
  { name: '相机', purpose: '拍摄照片，用于更换头像', icon: 'camera' },
  { name: '相册', purpose: '选择照片，用于更换头像', icon: 'album' }
];
onMounted(() => { if (headerTone) headerTone.value = 'settings'; });
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
</script>

<template>
  <main class="m-page privacy-page">
    <section class="privacy-section">
      <p class="group-label">系统权限</p>
      <div class="permission-card">
        <a v-for="item in permissions" :key="item.name" class="permission-row" href="app-settings:" target="_blank" rel="noopener">
          <span class="permission-icon" aria-hidden="true">
            <svg v-if="item.icon === 'camera'" viewBox="0 0 24 24"><path d="M4 8.5h3l1.4-2h7.2L17 8.5h3v10H4v-10Z" /><circle cx="12" cy="13.5" r="3.2" /></svg>
            <svg v-else viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2.4" /><circle cx="9" cy="10" r="1.6" /><path d="m5.5 17.5 4.2-4.2 3 3 2.4-2.4 3.4 3.6" /></svg>
          </span>
          <span class="permission-copy">
            <strong>{{ item.name }}</strong>
            <small>{{ item.purpose }}</small>
          </span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </a>
      </div>
      <p class="note">点击权限项，前往手机系统设置进行管理。</p>
    </section>

    <section class="privacy-section">
      <p class="group-label">关于权限</p>
      <div class="explain-card">
        <p>仅在你主动拍照或选择头像时，才会使用相应功能。</p>
        <p>你可以随时在手机系统设置中更改授权。关闭权限后，相关功能可能无法使用。</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.mobile-area .m-page.privacy-page{padding-top:16px;gap:24px}
.privacy-section{display:grid;gap:12px}
.group-label{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px}
.permission-card{background:var(--surface-card);border-radius:var(--radius-card);box-shadow:var(--m-shadow-button);overflow:hidden}
.permission-row{position:relative;display:flex;align-items:center;gap:12px;min-height:88px;padding:0 16px;color:inherit;text-decoration:none}
.permission-row + .permission-row::before{content:'';position:absolute;top:0;left:68px;right:16px;height:1px;background:var(--border-warm)}
.permission-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:20px;background:var(--m-disc);color:var(--brand-action)}
.permission-icon svg,.chevron{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.permission-icon svg{width:20px;height:20px}
.permission-copy{display:grid;gap:4px;flex:1;min-width:0}
.permission-copy strong{font-size:16px;line-height:24px;font-weight:400;color:var(--text-primary)}
.permission-copy small{font-size:12px;line-height:18px;color:var(--text-secondary)}
.chevron{flex:none;width:20px;height:20px;color:var(--text-secondary)}
.note{margin:0;color:var(--text-secondary);font-size:12px;line-height:18px}
.explain-card{display:grid;gap:16px;padding:0 16px}
.explain-card p{margin:0;color:var(--text-secondary);font-size:14px;line-height:21px}
</style>
