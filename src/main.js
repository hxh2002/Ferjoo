import { createApp } from 'vue';
import App from './App.vue';
import router from './router/index.js';
import { isMobilePath, usesMobileAccountLayout } from './lib/accountNavigation.js';
import { productRedirect } from './lib/site-entry.js';
import './assets/fonts.css';
import './assets/tokens.css';
import './assets/mobile.css';

// 欢迎页路径不在产品外壳里，因此不带 mobile-mode。宽屏样式由 DesktopNav 引入的 desktop.css 按 768px 断点自行开关。
const isMobileRoute = (route) => isMobilePath(route.path) || usesMobileAccountLayout(route, router);

router.afterEach((to, from, failure) => {
  if (failure) return;
  const mobile = isMobileRoute(to);
  document.documentElement.classList.toggle('mobile-mode', mobile);
  document.body.classList.toggle('mobile-mode', mobile);
});

// ferjoo.com 只承载欢迎页根路径；其它路径交给产品域名，不在欢迎域名上挂载应用。
const redirect = productRedirect();
if (redirect) {
  window.location.replace(redirect);
} else {
  const app = createApp(App);
  app.use(router);
  router.isReady().then(() => app.mount('#app'));
}
