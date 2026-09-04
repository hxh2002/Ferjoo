import { createRouter, createWebHistory } from 'vue-router';
import DoctorView from '../views/DoctorView.vue';
import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import HistoryView from '../views/HistoryView.vue';
import { useAuth } from '../composables/useAuth.js';

const routes = [
  { path: '/', name: 'doctor', component: DoctorView },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/register', name: 'register', component: RegisterView },
  { path: '/history', name: 'history', component: HistoryView, meta: { requiresAuth: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;
  const auth = useAuth();
  await auth.init();
  if (!auth.user.value) return { name: 'login', query: { redirect: to.fullPath } };
  return true;
});

export default router;
