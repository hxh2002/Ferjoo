import { createRouter, createWebHistory } from 'vue-router';
import DoctorView from '../views/DoctorView.vue';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import HistoryView from '../views/HistoryView.vue';
import ProfileView from '../views/ProfileView.vue';
import ClaimView from '../views/ClaimView.vue';
import MobileShell from '../components/MobileShell.vue';
import MobileToday from '../views/mobile/MobileToday.vue';
import MobileRecords from '../views/mobile/MobileRecords.vue';
import MobileMe from '../views/mobile/MobileMe.vue';
import MobileCheckin from '../views/mobile/MobileCheckin.vue';
import MobileFeeding from '../views/mobile/MobileFeeding.vue';
import MobileReport from '../views/mobile/MobileReport.vue';
import MobileDevices from '../views/mobile/MobileDevices.vue';
import MobileTrend from '../views/mobile/MobileTrend.vue';
import { useAuth } from '../composables/useAuth.js';
import { isMobileBrowser } from '../lib/device.js';

const routes = [
  { path: '/', name: 'doctor', component: DoctorView },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: RegisterView },
  { path: '/history', name: 'history', component: HistoryView, meta: { requiresAuth: true } },
  { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } },
  { path: '/claim', name: 'claim', component: ClaimView, meta: { requiresAuth: true } },
  {
    path: '/',
    component: MobileShell,
    children: [
      { path: 'today', name: 'mobile-today', component: MobileToday },
      { path: 'records', name: 'mobile-records', component: MobileRecords },
      { path: 'me', name: 'mobile-me', component: MobileMe },
      { path: 'checkin', name: 'mobile-checkin', component: MobileCheckin },
      { path: 'feeding', name: 'mobile-feeding', component: MobileFeeding },
      { path: 'reports/:id?', name: 'mobile-report', component: MobileReport },
      { path: 'me/devices', name: 'mobile-devices', component: MobileDevices, meta: { requiresAuth: true } },
      { path: 'me/devices/:deviceId', name: 'mobile-device-settings', component: MobileDevices, meta: { requiresAuth: true } },
      { path: 'devices/:deviceId/trend', name: 'mobile-trend', component: MobileTrend, meta: { requiresAuth: true } }
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
  if (!auth.user.value) return { name: 'login', query: { redirect: to.fullPath } };
  return true;
});

export default router;
