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
  try {
    profile.value = await getProfile(user.value.id);
  } catch {
    profile.value = null;
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
      supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        user.value = nextSession?.user || null;
        await loadProfile();
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
