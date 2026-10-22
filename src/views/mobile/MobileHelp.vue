<script setup>
import { classicAssets } from '../../constants/classicAssets.js';

const socials = [
  { name: 'Facebook', href: 'https://www.facebook.com/share/18v7fhWTYX/?mibextid=wwXIfr', icon: 'facebook' },
  { name: 'Instagram', href: 'https://www.instagram.com/ferjoooooo/', icon: 'instagram' },
  { name: '小红书', href: 'https://xhslink.cn/o/71W7wzdhmIV', icon: 'xiaohongshu' }
];
</script>
<template>
<main class="m-page help-page">
  <section class="m-card about-card">
    <img class="about-logo" :src="classicAssets.logoBrand" alt="Dr. Ferjoo">
    <h2>让每一次发酵，都有迹可循。</h2>
    <p>Ferjoo 记录酵种养护事实与观察，估时是经验范围，不是质量或安全保证。</p>
    <div class="about-socials" aria-label="Ferjoo 社交媒体">
      <a v-for="social in socials" :key="social.name" class="about-social" :href="social.href" target="_blank" rel="noopener noreferrer" :aria-label="social.name" :title="social.name">
        <svg v-if="social.icon === 'facebook'" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13.7 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3V10H7.5v3h2.8v8h3.4Z"/>
        </svg>
        <svg v-else-if="social.icon === 'instagram'" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" ry="5.2" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="2"/>
          <circle cx="17.4" cy="6.8" r="1.1"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5.2 4.2h13.6A2.2 2.2 0 0 1 21 6.4v11.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 17.6V6.4a2.2 2.2 0 0 1 2.2-2.2Z" fill="none" stroke="currentColor" stroke-width="1.8"/>
          <path d="M7 8h3.5v2H9.4v5.8H7V8Zm4.5 0h2.3l1.2 2.2L16.2 8h2.3l-2.3 3.7 2.5 4.1h-2.4L15 13.3l-1.4 2.5h-2.4l2.6-4.1L11.5 8Z"/>
        </svg>
        <span>{{ social.name }}</span>
      </a>
    </div>
  </section>
  <section class="m-card help-info">
    <h2>开始养护</h2>
    <p>先添加酵种，记录喂养时间和比例，再通过「记录观察」获取建议。没有设备也可手工使用。</p>
    <h2>设备与趋势</h2>
    <p>绑定设备后为酵种关联设备。趋势只展示关联时间段；设备设置中的趋势展示全部历史。</p>
    <h2>食品安全</h2>
    <p>异常颜色、绒毛或腐败异味应优先处理。不要品尝可疑酵种或生面粉；建议不能代替食品安全判断。</p>
    <h2>隐私与共享</h2>
    <p>设备成员可查看该设备全部历史采样；个人观察、备注和报告不共享。草稿保存在当前浏览器。</p>
  </section>
</main>
</template>
<style scoped>
.help-page{color:#30251f}
section{margin-top:16px}
.help-info{ text-align:left }
p{line-height:1.7}
h2{font-size:20px}
.about-card{text-align:center}
.about-logo{width:160px;height:auto;margin:.25rem auto 1rem;display:block}
.about-card h2{font-size:1.25rem;margin:0 0 .5rem}
.about-card p{font-size:.85rem;color:#625e56;margin:0}
.about-socials{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:1rem}
.about-social{position:relative;width:52px;height:52px;border:1px solid var(--m-border);border-radius:var(--m-radius-button);display:grid;place-items:center;background:var(--m-surface);color:inherit;text-decoration:none}
.about-social svg{width:22px;height:22px;fill:currentColor}
.about-social span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
</style>
