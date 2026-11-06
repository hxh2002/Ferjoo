import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { isMobileBrowser } from '../lib/device.js';
import { safeRedirect } from '../lib/accountNavigation.js';

// 旧地址保留 redirect，书签、推送与已安装的 PWA 都能落到新信息架构。
const legacy = (path) => (to) => ({ path, query: to.query, hash: to.hash, replace: true });

const routes = [
  { path: '/', name: 'doctor', component: () => import('../views/DoctorView.vue') },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue') },
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
      { path: 'doctor/rounds', name: 'doctor-rounds', component: () => import('../views/mobile/MobileDoctorRounds.vue'), meta: { requiresAuth: true, title: '酵种医生' } },
      { path: 'checkin', name: 'mobile-checkin', component: () => import('../views/mobile/MobileCheckin.vue'), meta: { title: '酵种医生' }, beforeEnter: (to) => (to.query.feeding || to.query.edit === 'session' ? true : { path: '/doctor/rounds', query: to.query, replace: true }) },
      { path: 'feeding', name: 'mobile-feeding', component: () => import('../views/mobile/MobileFeeding.vue'), meta: { requiresAuth: true } },
      { path: 'reports/session', name: 'report-session', component: () => import('../views/mobile/MobileReport.vue') },
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
    return { name: 'login', query: redirect ? { redirect } : {} };
  }
  return true;
});

export default router;
