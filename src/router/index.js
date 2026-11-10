import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { isMobileBrowser } from '../lib/device.js';
import { safeRedirect, usesMobileAccountLayout } from '../lib/accountNavigation.js';

// 旧地址保留 redirect，书签、推送与已安装的 PWA 都能落到新信息架构。
const legacy = (path) => (to) => ({ path, query: to.query, hash: to.hash, replace: true });

// /login 与 /register 仍是桌面入口；移动端或被重定向到移动页时，按名称切到 MobileShell 内的子路由。
// 子路由 path 与顶层同址，vue-router 命中顶层记录，所以分流放在 beforeEnter，桌面行为保持不变。
// 判定复用 usesMobileAccountLayout，保证与 App.vue / main.js 的布局与样式切换同源。
// 另加窄视口兜底：桌面浏览器缩到手机宽度（以及只设 device metrics、不改 UA 的模拟）也走移动表单。
// 目标路由名是 mobile-*，usesMobileAccountLayout 对它恒为 true，所以 mobile-mode 与布局不会与 App.vue 脱节。
function isPhoneViewport() {
  return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth <= 640;
}

const mobileAuth = (name) => (to) => (isMobileBrowser() || isPhoneViewport() || usesMobileAccountLayout(to, router)
  ? { name, query: to.query, hash: to.hash, replace: true }
  : true);

const routes = [
  { path: '/', name: 'doctor', component: () => import('../views/DoctorView.vue') },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), beforeEnter: mobileAuth('mobile-login') },
  { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue'), beforeEnter: mobileAuth('mobile-register') },
  { path: '/history', name: 'history', component: () => import('../views/HistoryView.vue'), meta: { requiresAuth: true } },
  { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } },
  { path: '/claim', name: 'claim', component: () => import('../views/ClaimView.vue'), meta: { requiresAuth: true } },
  {
    path: '/',
    component: () => import('../components/MobileShell.vue'),
    children: [
      { path: 'device', name: 'mobile-device', component: () => import('../views/mobile/MobileDeviceHome.vue') },
      { path: 'diary', name: 'mobile-diary', component: () => import('../views/mobile/MobileDiary.vue') },
      { path: 'diary/records/:id', name: 'record-detail', component: () => import('../views/mobile/MobileRecordDetail.vue'), meta: { requiresAuth: true } },
      { path: 'today', redirect: legacy('/device') },
      { path: 'records', redirect: legacy('/diary') },
      { path: 'records/:id', redirect: (to) => ({ path: `/diary/records/${encodeURIComponent(to.params.id)}`, query: to.query, hash: to.hash, replace: true }) },
      { path: 'me', name: 'mobile-me', component: () => import('../views/mobile/MobileMe.vue') },
      { path: 'login', name: 'mobile-login', component: () => import('../views/mobile/MobileLogin.vue') },
      { path: 'register', name: 'mobile-register', component: () => import('../views/mobile/MobileRegister.vue') },
      { path: 'doctor/rounds', name: 'doctor-rounds', component: () => import('../views/mobile/MobileDoctorRounds.vue'), meta: { requiresAuth: true, title: '酵种医生' } },
      { path: 'checkin', name: 'mobile-checkin', component: () => import('../views/mobile/MobileCheckin.vue'), meta: { title: '酵种医生' }, beforeEnter: (to) => (to.query.feeding || to.query.edit === 'session' ? true : { path: '/doctor/rounds', query: to.query, replace: true }) },
      { path: 'feeding', name: 'mobile-feeding', component: () => import('../views/mobile/MobileFeeding.vue'), meta: { requiresAuth: true } },
      { path: 'reports/session', name: 'report-session', component: () => import('../views/mobile/MobileReport.vue'), meta: { title: '酵种医生' } },
      { path: 'reports/:id?', name: 'mobile-report', component: () => import('../views/mobile/MobileReport.vue'), meta: { requiresAuth: true } },
      { path: 'me/profile', name: 'mobile-profile', component: () => import('../views/mobile/MobileProfile.vue'), meta: { requiresAuth: true, title: '个人资料' } },
      { path: 'me/profile/edit', name: 'mobile-profile-edit', component: () => import('../views/mobile/MobileProfileEdit.vue'), meta: { requiresAuth: true, title: '编辑资料' } },
      { path: 'me/devices', name: 'mobile-devices', component: () => import('../views/mobile/MobileDevices.vue'), meta: { requiresAuth: true } },
      { path: 'me/devices/add', name: 'mobile-device-add', component: () => import('../views/mobile/MobileDeviceAdd.vue'), meta: { requiresAuth: true, title: '添加设备' } },
      { path: 'me/devices/:deviceId/info', name: 'mobile-device-info', component: () => import('../views/mobile/MobileDeviceInfo.vue'), meta: { requiresAuth: true, title: '设备信息' } },
      { path: 'me/devices/:deviceId', name: 'mobile-device-settings', component: () => import('../views/mobile/MobileDevices.vue'), meta: { requiresAuth: true } },
      { path: 'me/help/faq', name: 'mobile-faq', component: () => import('../views/mobile/MobileFaq.vue'), meta: { title: '常见问题' } },
      { path: 'me/help/feedback', name: 'mobile-feedback', component: () => import('../views/mobile/MobileFeedback.vue'), meta: { requiresAuth: true, title: '意见反馈' } },
      { path: 'me/help/privacy', name: 'mobile-privacy', component: () => import('../views/mobile/MobilePrivacy.vue'), meta: { title: '隐私与权限' } },
      { path: 'devices/:deviceId/trend', name: 'mobile-trend', component: () => import('../views/mobile/MobileTrend.vue'), meta: { requiresAuth: true } },
      { path: 'me/invite', name: 'invite', component: () => import('../views/mobile/MobileInvite.vue'), meta: { requiresAuth: true } },
      { path: 'me/help', name: 'help', component: () => import('../views/mobile/MobileHelp.vue') },
      { path: 'me/account', name: 'account', component: () => import('../views/mobile/MobileAccount.vue'), meta: { requiresAuth: true } },
      { path: 'me/notifications', name: 'notifications', component: () => import('../views/mobile/MobileNotifications.vue'), meta: { requiresAuth: true } }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { top: 0 };
  }
});

router.beforeEach(async (to) => {
  if (to.name === 'doctor' && to.query.view !== 'desktop' && isMobileBrowser()) {
    return { name: 'mobile-device', query: to.query, hash: to.hash, replace: true };
  }
  if (!to.meta.requiresAuth) return true;
  const auth = useAuth();
  await auth.init();
  if (!auth.user.value) {
    const redirect = safeRedirect(to.fullPath, router);
    const query = redirect ? { redirect } : {};
    // 移动端直接进 MobileShell 内的登录页；桌面仍回 /login。
    const name = usesMobileAccountLayout({ name: 'login', query }, router) ? 'mobile-login' : 'login';
    return { name, query };
  }
  return true;
});

export default router;
