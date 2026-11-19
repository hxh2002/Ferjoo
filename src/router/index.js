import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { safeRedirect } from '../lib/accountNavigation.js';
import { isWelcomeHost } from '../lib/site-entry.js';

// 旧地址保留 redirect，书签、推送与已安装的 PWA 都能落到新信息架构。
const legacy = (path) => (to) => ({ path, query: to.query, hash: to.hash, replace: true });

// ferjoo.com 的 "/" 是欢迎页；其它域名（dr.ferjoo.com、本地）的 "/" 直接进入产品主体。
// 宽窄屏只由 CSS 断点决定，路由与组件只有一套；旧的电脑端地址并入同一套页面。
const routes = [
  {
    path: '/',
    name: 'welcome',
    component: () => import('../views/WelcomeView.vue'),
    meta: { welcome: true },
    beforeEnter: (to) => (isWelcomeHost() ? true : { path: '/device', query: to.query, hash: to.hash, replace: true })
  },
  { path: '/login', redirect: (to) => ({ name: 'mobile-login', query: to.query, hash: to.hash }) },
  { path: '/register', redirect: (to) => ({ name: 'mobile-register', query: to.query, hash: to.hash }) },
  { path: '/history', redirect: legacy('/doctor/records') },
  { path: '/profile', redirect: legacy('/me/profile') },
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
      { path: 'doctor/records', name: 'doctor-records', component: () => import('../views/mobile/MobileDoctorRecords.vue'), meta: { requiresAuth: true, title: '酵种医生' } },
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
      { path: 'me/notifications', name: 'notifications', component: () => import('../views/mobile/MobileNotifications.vue'), meta: { requiresAuth: true } },
      { path: 'claim', name: 'claim', component: () => import('../views/ClaimView.vue'), meta: { requiresAuth: true, title: '绑定设备' } },
      {
        path: 'admin',
        component: () => import('../views/admin/AdminLayout.vue'),
        meta: { requiresAuth: true, requiresAdmin: true, title: '概览' },
        children: [
          { path: '', name: 'admin-overview', component: () => import('../views/admin/AdminOverview.vue'), meta: { title: '概览' } },
          { path: 'users', name: 'admin-users', component: () => import('../views/admin/AdminUsers.vue'), meta: { title: '用户与权限' } },
          { path: 'bindings', name: 'admin-bindings', component: () => import('../views/admin/AdminBindings.vue'), meta: { title: '绑定关系' } },
          { path: 'rounds', name: 'admin-rounds', component: () => import('../views/admin/AdminRounds.vue'), meta: { title: '发酵轮次' } },
          { path: 'devices', name: 'admin-devices', component: () => import('../views/admin/AdminDevices.vue'), meta: { title: '设备' } },
          { path: 'care', name: 'admin-care', component: () => import('../views/admin/AdminCare.vue'), meta: { title: '养护与反馈' } },
          { path: 'analytics', name: 'admin-analytics', component: () => import('../views/admin/AdminAnalytics.vue'), meta: { title: '埋点观察' } }
        ]
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash };
    return { top: 0 };
  }
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth && !to.meta.requiresAdmin) return true;
  const auth = useAuth();
  await auth.init();
  if (!auth.user.value) {
    const redirect = safeRedirect(to.fullPath, router);
    const query = redirect ? { redirect } : {};
    return { name: 'mobile-login', query };
  }
  if (to.meta.requiresAdmin && auth.profile.value?.role !== 'A') return { path: '/device' };
  return true;
});

export default router;
