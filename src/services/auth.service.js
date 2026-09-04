import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

function requireClient() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase 尚未配置。请填写 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。');
  }
  return supabase;
}

export async function signUpWithEmail({ email, password, displayName }) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || '' } }
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail({ email, password }) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  if (!hasSupabaseConfig || !supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getProfile(userId) {
  const client = requireClient();
  const { data, error } = await client
    .from('profiles')
    .select('id, system_user_id, role, email, display_name, created_at')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}
