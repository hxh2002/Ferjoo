import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const AVATAR_BUCKET = 'avatars';
const PROFILE_COLUMNS = 'id, system_user_id, role, email, display_name, created_at, avatar_url, gender, birth_date, profile_identity, invite_code, invite_quota, invited_count, invited_by';

function missingSuperAdminColumn(error) {
  return error?.code === '42703' || error?.code === 'PGRST204' || /is_super_admin/i.test(error?.message || '');
}

async function selectProfile(client, userId) {
  const extended = await client.from('profiles').select(`${PROFILE_COLUMNS}, is_super_admin`).eq('id', userId).single();
  if (!extended.error) return extended.data;
  if (!missingSuperAdminColumn(extended.error)) throw extended.error;
  const fallback = await client.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single();
  if (fallback.error) throw fallback.error;
  return { ...fallback.data, is_super_admin: false };
}

function requireClient() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase 尚未配置。请填写 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。');
  }
  return supabase;
}

export async function signUpWithEmail({ email, password, displayName, inviteCode }) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || '',
        invite_code: (inviteCode || '').trim()
      }
    }
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
  return selectProfile(requireClient(), userId);
}

export async function updateProfile(userId, updates = {}) {
  const client = requireClient();
  const payload = {};
  if ('displayName' in updates) payload.display_name = updates.displayName?.trim() || null;
  if ('avatarUrl' in updates) payload.avatar_url = updates.avatarUrl || null;
  if ('gender' in updates) payload.gender = updates.gender || null;
  if ('birthDate' in updates) payload.birth_date = updates.birthDate || null;
  if ('identity' in updates) payload.profile_identity = updates.identity || null;

  const { error } = await client.from('profiles').update(payload).eq('id', userId);
  if (error) throw error;
  return selectProfile(client, userId);
}

export async function uploadAvatar(userId, blob) {
  const client = requireClient();
  const path = `${userId}/avatar_${Date.now()}.png`;
  const { error } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteAvatarFile(userId, avatarUrl) {
  const client = requireClient();
  if (!avatarUrl) return;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const index = avatarUrl.indexOf(marker);
  if (index === -1) return;
  const path = avatarUrl.slice(index + marker.length);
  if (!path.startsWith(`${userId}/`)) return;
  const { error } = await client.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) throw error;
}

export async function removeAvatar(userId, avatarUrl) {
  await deleteAvatarFile(userId, avatarUrl).catch(() => {});
  return updateProfile(userId, { avatarUrl: null });
}

export async function changePassword({ oldPassword, newPassword }) {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const email = userData?.user?.email;
  if (!email) throw new Error('无法确认当前账号邮箱。');

  const { error: verifyError } = await client.auth.signInWithPassword({ email, password: oldPassword });
  if (verifyError) throw new Error('旧密码不正确。');

  const { data, error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}
