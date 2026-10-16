import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import { isMobilePath, usesMobileAccountLayout } from './lib/accountNavigation.js';
import './assets/tokens.css';
import './assets/mobile.css';

let desktopStyle;
let desktopStylePromise;
const isMobileRoute = (route) => isMobilePath(route.path) || usesMobileAccountLayout(route, router);

async function prepareDesktopStyle() {
  if (!desktopStylePromise) {
    // Inline CSS stays inert until its style element is enabled; mobile never imports it.
    desktopStylePromise = import('./assets/main.css?inline').then(({ default: css }) => {
      desktopStyle = document.createElement('style');
      desktopStyle.dataset.layout = 'desktop';
      desktopStyle.media = 'not all';
      desktopStyle.textContent = css;
      document.head.append(desktopStyle);
    });
  }
  await desktopStylePromise;
}

router.beforeResolve(async (to) => {
  if (!isMobileRoute(to)) await prepareDesktopStyle();
});
router.afterEach((to, from, failure) => {
  if (failure) return;
  const mobile = isMobileRoute(to);
  if (desktopStyle) desktopStyle.media = mobile ? 'not all' : 'all';
  document.documentElement.classList.toggle('mobile-mode', mobile);
  document.body.classList.toggle('mobile-mode', mobile);
});

const app = createApp(App);
app.use(router);
router.isReady().then(() => app.mount('#app'));
