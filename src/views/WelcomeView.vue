<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import brandLogo from '../assets/about/brand-logo-circle.png';
import socialInstagram from '../assets/about/social-instagram.svg';
import socialXiaohongshu from '../assets/about/social-xiaohongshu.svg';
import { PRODUCT_ORIGIN } from '../lib/site-entry.js';
import DrFerjooMark from '../components/DrFerjooMark.vue';

const socials = [
  { name: 'Instagram', href: 'https://www.instagram.com/ferjoooooo/', icon: socialInstagram },
  { name: '小红书', href: 'https://xhslink.cn/o/71W7wzdhmIV', icon: socialXiaohongshu }
];

// 「产品」展开：鼠标悬停 / 键盘聚焦临时展开，点击或轻触固定展开；Escape、再次点击、外部点击或焦点离开后关闭。
const menuRoot = ref(null);
const menuButton = ref(null);
const open = ref(false);
const pinned = ref(false);
let closeTimer;

function show() { clearTimeout(closeTimer); open.value = true; }
function hide() { clearTimeout(closeTimer); open.value = false; pinned.value = false; }
function onPointerEnter(event) { if (event.pointerType === 'mouse') show(); }
function onPointerLeave(event) {
  if (event.pointerType !== 'mouse' || pinned.value) return;
  closeTimer = setTimeout(hide, 140);
}
function onFocusOut(event) {
  if (!menuRoot.value?.contains(event.relatedTarget)) hide();
}
function toggle() {
  if (open.value && pinned.value) { hide(); return; }
  show();
  pinned.value = true;
}
function onKeydown(event) {
  if (event.key !== 'Escape' || !open.value) return;
  hide();
  menuButton.value?.focus();
}
function onDocumentPointerDown(event) {
  if (open.value && !menuRoot.value?.contains(event.target)) hide();
}
const previousTitle = document.title;
onMounted(() => {
  document.title = 'Ferjoo';
  document.addEventListener('pointerdown', onDocumentPointerDown);
});
onBeforeUnmount(() => {
  document.title = previousTitle;
  clearTimeout(closeTimer);
  document.removeEventListener('pointerdown', onDocumentPointerDown);
});
</script>

<template>
  <div class="welcome" @keydown="onKeydown">
    <header class="welcome-bar">
      <RouterLink class="welcome-brand" to="/" aria-label="Ferjoo">
        <img :src="brandLogo" alt="" width="36" height="36" />
        <span>Ferjoo</span>
      </RouterLink>
      <nav class="welcome-nav" aria-label="主导航">
        <div ref="menuRoot" class="welcome-menu" @pointerenter="onPointerEnter" @pointerleave="onPointerLeave" @focusin="show" @focusout="onFocusOut">
          <button ref="menuButton" type="button" class="welcome-menu-button" :aria-expanded="open" aria-controls="welcome-products" @click="toggle">
            产品
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <ul id="welcome-products" class="welcome-products" :class="{ 'is-open': open }" :hidden="!open">
            <li><RouterLink :to="{ path: '/', hash: '#sourmate' }" @click="hide">SourMate</RouterLink></li>
            <li><a class="welcome-doctor" :href="PRODUCT_ORIGIN" aria-label="Dr. Ferjoo" @click="hide"><DrFerjooMark variant="cn" /></a></li>
          </ul>
        </div>
        <RouterLink :to="{ path: '/', hash: '#about' }">关于</RouterLink>
      </nav>
    </header>

    <main>
      <section class="welcome-hero">
        <img class="welcome-mascot" src="/assets/jojo1.png" alt="" width="200" height="200" />
        <h1>Ferment with joy.</h1>
        <p>陪你记录养护日常，看见每一次变化。</p>
      </section>

      <section id="sourmate" class="welcome-section" aria-labelledby="sourmate-title">
        <p class="welcome-kicker">硬件产品</p>
        <div>
          <h2 id="sourmate-title">SourMate</h2>
          <p>放在酵种旁，自动记录涨幅、温度与湿度，数据同步到 Dr. Ferjoo 酵种医生。</p>
        </div>
      </section>

      <section id="about" class="welcome-section" aria-labelledby="about-title">
        <p class="welcome-kicker">关于</p>
        <div>
          <h2 id="about-title">Ferjoo</h2>
          <p class="welcome-cn-mark"><DrFerjooMark variant="cn" /></p>
          <p>我们做的是让发酵更从容的小工具：SourMate 负责记录，Dr. Ferjoo 酵种医生帮你读懂酵种的每一次变化。</p>
          <ul class="welcome-socials" aria-label="关注 Ferjoo">
            <li v-for="social in socials" :key="social.name">
              <a :href="social.href" target="_blank" rel="noopener noreferrer"><img :src="social.icon" alt="" width="20" height="20" />{{ social.name }}</a>
            </li>
          </ul>
        </div>
      </section>
    </main>
  </div>
</template>

<style>
/* 欢迎页脱离产品外壳，只在这里重置浏览器默认外边距。 */
body { margin: 0; background: #fff9f3; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
</style>

<style scoped>
.welcome { min-height: 100vh; min-height: 100dvh; color: var(--text-primary); background: radial-gradient(120% 70% at 50% -10%, #ffe9d2 0%, #fff9f3 58%); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
.welcome a { color: inherit; text-decoration: none; }
.welcome :focus-visible { outline: 2px solid var(--brand-action); outline-offset: 3px; border-radius: 8px; }

.welcome-bar { position: fixed; inset: 0 0 auto; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 14px clamp(20px, 5vw, 56px); background: rgba(255, 249, 243, .8); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.welcome-brand { display: inline-flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; letter-spacing: -.02em; }
.welcome-brand img { border-radius: 50%; }
.welcome-nav { display: flex; align-items: center; gap: clamp(8px, 2vw, 20px); }
.welcome-nav > a, .welcome-menu-button { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 12px; border: 0; border-radius: 22px; background: transparent; color: var(--text-primary); font: inherit; font-size: 15px; cursor: pointer; transition: background 160ms ease, color 160ms ease; }
.welcome-nav > a:hover, .welcome-menu-button:hover, .welcome-menu-button[aria-expanded="true"] { background: #ffeddc; color: var(--brand-action); }
.welcome-menu-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 160ms ease; }
.welcome-menu-button[aria-expanded="true"] svg { transform: rotate(180deg); }
.welcome-menu { position: relative; }
/* 触发器与菜单之间不留空隙，鼠标从按钮移向菜单时不会中途关闭。 */
.welcome-products { position: absolute; top: 100%; right: 0; min-width: 220px; margin: 0; padding: 8px; list-style: none; border: 1px solid var(--border-warm); border-radius: 16px; background: #fffdf9; box-shadow: 0 18px 48px rgba(76, 46, 24, .14); }
.welcome-products[hidden] { display: none; }
.welcome-products.is-open { animation: welcome-pop 160ms var(--ease-standard); }
.welcome-products a { display: flex; align-items: center; min-height: 44px; padding: 0 14px; border-radius: 10px; font-size: 15px; white-space: nowrap; }
.welcome-products a.welcome-doctor { padding: 6px 8px; }
.welcome-products a:hover { background: #fff1e3; color: var(--brand-action); }
@keyframes welcome-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

.welcome-hero { display: grid; justify-items: center; align-content: center; gap: 12px; min-height: 100vh; min-height: 100svh; padding: 96px 24px 72px; text-align: center; }
.welcome-mascot { width: clamp(132px, 22vw, 200px); height: auto; }
.welcome-hero h1 { margin: 8px 0 0; font-size: clamp(40px, 8vw, 76px); font-weight: 500; line-height: 1.05; letter-spacing: -.04em; }
.welcome-hero p { margin: 0; color: var(--text-secondary); font-size: clamp(15px, 2.2vw, 18px); line-height: 1.7; }

.welcome-section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; max-width: 880px; margin: 0 auto; padding: 56px 24px; border-top: 1px solid var(--border-warm); scroll-margin-top: 64px; }
.welcome-kicker { margin: 0; color: var(--brand-action); font-size: 13px; letter-spacing: .08em; }
.welcome-section h2 { margin: 0 0 12px; font-size: clamp(26px, 4vw, 34px); font-weight: 500; letter-spacing: -.03em; }
.welcome-section p:not(.welcome-kicker) { margin: 0; color: var(--text-secondary); font-size: 16px; line-height: 1.85; }
.welcome-section p.welcome-cn-mark { margin: 0 0 16px; }
.welcome-socials { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 24px 0 0; padding: 0; list-style: none; }
.welcome-socials a { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--text-secondary); font-size: 14px; }
.welcome-socials a:hover { color: var(--brand-action); }
.welcome-socials img { width: 20px; height: 20px; }
.welcome-section:last-child { padding-bottom: 96px; }

@media (min-width: 768px) {
  .welcome-section { grid-template-columns: 140px minmax(0, 1fr); gap: 32px; padding-block: 72px; }
}
@media (max-height: 520px) and (orientation: landscape) {
  .welcome { overflow-x: clip; }
  .welcome-bar { flex-wrap: nowrap; gap: 12px; padding-block: 8px; }
  .welcome-brand { min-width: 0; }
  .welcome-brand span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .welcome-nav { flex: none; }
  .welcome-hero { box-sizing: border-box; grid-template-columns: auto minmax(0, 1fr); justify-content: center; justify-items: start; align-content: center; align-items: center; column-gap: 28px; row-gap: 6px; min-height: 100svh; padding: 64px 32px 24px; text-align: left; }
  .welcome-mascot { grid-column: 1; grid-row: 1 / span 2; width: min(112px, 28vh); }
  .welcome-hero h1, .welcome-hero p { grid-column: 2; }
  .welcome-hero h1 { margin: 0; font-size: clamp(32px, 5vw, 48px); }
  .welcome-hero p { max-width: 36rem; }
  .welcome-section { padding-block: 28px; }
}
</style>
