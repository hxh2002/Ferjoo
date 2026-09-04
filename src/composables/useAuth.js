import { computed, ref } from 'vue';
import { supabase, supabaseConfigured } from '../lib/supabase.js';
import {
  getCurrentSession,
  getProfile,
  signInWithEmail,
  signOut as serviceSignOut,
  signUpWithEmail
} from '../services/auth.service.js';

const user = ref(null);
const profile = ref(null);
const loading = ref(true);
const authError = ref('');
let initPromise = null;
let subscribed = false;

async function hydrate(session) {
  user.value = session?.user ?? null;
  profile.value = null;

  if (!user.value) return;

  try {
    profile.value = await getProfile(user.value.id);
  } catch (error) {
    authError.value = error?.message || '用户资料读取失败';
  }
}

export function useAuth() {
  const isAuthenticated = computed(() => Boolean(user.value));
  const systemUserId = computed(() => profile.value?.system_user_id ?? '');
  const role = computed(() => profile.value?.role ?? 'U');

  async function init() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      loading.value = true;
      authError.value = '';

      if (!supabaseConfigured) {
        loading.value = false;
        return;
      }

      try {
        const session = await getCurrentSession();
        await hydrate(session);

        if (!subscribed) {
          subscribed = true;
          supabase.auth.onAuthStateChange((_event, nextSession) => {
            queueMicrotask(() => hydrate(nextSession));
          });
        }
      } catch (error) {
        authError.value = error?.message || '登录状态初始化失败';
      } finally {
        loading.value = false;
      }
    })();

    return initPromise;
  }

  async function register(email, password, displayName = '') {
    authError.value = '';
    const data = await signUpWithEmail(email, password, displayName);
    if (data.session) await hydrate(data.session);
    return data;
  }

  async function login(email, password) {
    authError.value = '';
    const data = await signInWithEmail(email, password);
    await hydrate(data.session);
    return data;
  }

  async function logout() {
    authError.value = '';
    await serviceSignOut();
    user.value = null;
    profile.value = null;
  }

  async function refreshProfile() {
    if (user.value) profile.value = await getProfile(user.value.id);
    return profile.value;
  }

  return {
    user,
    profile,
    loading,
    authError,
    isAuthenticated,
    systemUserId,
    role,
    supabaseConfigured,
    init,
    register,
    login,
    logout,
    refreshProfile
  };
}
