import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';
import { isMobileBrowser } from '../lib/device.js';
import { safeRedirect } from '../lib/accountNavigation.js';

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
      { path: 'today', name: 'mobile-today', component: () => import('../views/mobile/MobileToday.vue') },
      { path: 'records', name: 'mobile-records', component: () => import('../views/mobile/MobileRecords.vue') },
      { path: 'records/:id', name: 'record-detail', component: () => import('../views/mobile/MobileRecordDetail.vue'), meta: { requiresAuth: true } },
      { path: 'me', name: 'mobile-me', component: () => import('../views/mobile/MobileMe.vue') },
      { path: 'checkin', name: 'mobile-checkin', component: () => import('../views/mobile/MobileCheckin.vue') },
      { path: 'feeding', name: 'mobile-feeding', component: () => import('../views/mobile/MobileFeeding.vue'), meta: { requiresAuth: true } },
      { path: 'reports/session', name: 'report-session', component: () => import('../views/mobile/MobileReport.vue') },
      { path: 'reports/:id?', name: 'mobile-report', component: () => import('../views/mobile/MobileReport.vue'), meta: { requiresAuth: true } },
      { path: 'me/devices', name: 'mobile-devices', component: () => import('../views/mobile/MobileDevices.vue'), meta: { requiresAuth: true } },
      { path: 'me/devices/:deviceId', name: 'mobile-device-settings', component: () => import('../views/mobile/MobileDevices.vue'), meta: { requiresAuth: true } },
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
    return { name: 'mobile-today', query: to.query, hash: to.hash, replace: true };
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
