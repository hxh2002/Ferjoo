import { createRouter, createWebHistory } from 'vue-router';
import DoctorView from '../views/DoctorView.vue';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import HistoryView from '../views/HistoryView.vue';
import { useAuth } from '../composables/useAuth.js';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'doctor', component: DoctorView },
    { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
    { path: '/register', name: 'register', component: RegisterView, meta: { guestOnly: true } },
    { path: '/history', name: 'history', component: HistoryView, meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  const auth = useAuth();
  await auth.init();

  if (to.meta.requiresAuth && !auth.user.value) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (to.meta.guestOnly && auth.user.value) {
    return { name: 'doctor' };
  }

  return true;
});

export default router;
