import { ref } from 'vue';
import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { getCurrentSession, getProfile, signOut as serviceSignOut } from '../services/auth.service.js';

const user = ref(null);
const profile = ref(null);
const ready = ref(false);
let initPromise = null;
let subscribed = false;

async function loadProfile() {
  if (!user.value || !hasSupabaseConfig) {
    profile.value = null;
    return;
  }
  const userId = user.value.id;
  try {
    const nextProfile = await getProfile(userId);
    if (user.value?.id === userId) profile.value = nextProfile;
  } catch {
    if (user.value?.id === userId) profile.value = null;
  }
}

async function syncSession() {
  const session = await getCurrentSession();
  user.value = session?.user || null;
  await loadProfile();
  ready.value = true;
  return session;
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await syncSession();
    if (supabase && !subscribed) {
      subscribed = true;
      supabase.auth.onAuthStateChange((_event, nextSession) => {
        const nextUser = nextSession?.user || null;
        if (user.value?.id !== nextUser?.id) profile.value = null;
        user.value = nextUser;
        setTimeout(() => { loadProfile(); }, 0);
      });
    }
  })();
  return initPromise;
}

async function refreshProfile() {
  await loadProfile();
}

async function logout() {
  await serviceSignOut();
  user.value = null;
  profile.value = null;
}

export function useAuth() {
  return { user, profile, ready, init, syncSession, refreshProfile, logout, configured: hasSupabaseConfig };
}
