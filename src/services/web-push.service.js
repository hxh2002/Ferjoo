import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const publicKey = import.meta.env?.VITE_VAPID_PUBLIC_KEY?.trim();

function requireClient() {
  if (!hasSupabaseConfig || !supabase) throw new Error('云端提醒尚未配置 Supabase。');
  return supabase;
}

function decodeKey(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function webPushAvailable(scope = globalThis) {
  return Boolean(publicKey && scope.isSecureContext && scope.navigator?.serviceWorker && scope.PushManager);
}

export async function subscribeHeightPush(scope = globalThis) {
  if (!webPushAvailable(scope)) throw new Error('此浏览器或环境不支持云端 Web Push。');
  const client = requireClient();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw new Error('请登录后开启云端提醒。');
  const registration = await scope.navigator.serviceWorker.register('/sw.js');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) throw new Error('浏览器推送订阅数据不完整。');
  const { error } = await client.rpc('register_push_subscription', {
    p_user_id: user.id, p_endpoint: serialized.endpoint, p_p256dh: serialized.keys.p256dh, p_auth: serialized.keys.auth,
  });
  if (error) throw new Error('云端订阅保存失败，请重试。');
  return subscription;
}

export async function hasCloudPushSubscription(scope = globalThis) {
  if (!hasSupabaseConfig || !scope.navigator?.serviceWorker) return false;
  const registration = await scope.navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) return false;
  const { data, error } = await requireClient().from('push_subscriptions').select('id').eq('endpoint', subscription.endpoint).maybeSingle();
  return !error && Boolean(data?.id);
}

export async function saveHeightTargets(starterId, targets) {
  const client = requireClient();
  const { error } = await client.rpc('set_height_alert_targets', { p_starter_id: starterId, p_targets: targets });
  if (error) throw new Error('云端预约保存失败，请重试。');
}

export async function loadHeightTargets(starterId) {
  if (!starterId) return [];
  const client = requireClient();
  const { data, error } = await client.from('height_alert_settings').select('targets').eq('starter_id', starterId).maybeSingle();
  if (error) throw new Error('云端预约读取失败。');
  return data?.targets || [];
}

export async function removeHeightPush(scope = globalThis) {
  const registration = await scope.navigator?.serviceWorker?.getRegistration?.('/');
  const subscription = await registration?.pushManager?.getSubscription?.();
  if (!subscription) return;
  let failure;
  try {
    const client = requireClient();
    const { error } = await client.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint });
    if (error) failure = new Error('云端订阅解绑失败，请重试。');
  } finally {
    await subscription.unsubscribe();
  }
  if (failure) throw failure;
}
