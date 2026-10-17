import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { summarizeFeedingMeasurements } from '../../../src/services/feeding-analysis.service.js';
import { eligibleRatio, retryDelay, safePushEndpoint, validInternalSecret } from './policy.js';

const cors = { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Headers': 'content-type,x-height-push-secret', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (key: string) => Deno.env.get(key) || '';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!await validInternalSecret(request.headers.get('x-height-push-secret') || '', env('HEIGHT_PUSH_INTERNAL_SECRET'))) return json(401, { error: 'unauthorized' });
  const url = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublic = env('VAPID_PUBLIC_KEY');
  const vapidPrivate = env('VAPID_PRIVATE_KEY');
  const vapidSubject = env('VAPID_SUBJECT');
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate || !vapidSubject) return json(503, { error: 'push_not_configured' });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  let evaluations = 0;
  let deliveries = 0;

  const claimed = await db.rpc('claim_height_evaluations');
  if (claimed.error) return json(500, { error: 'evaluation_claim_failed' });
  for (const setting of claimed.data || []) {
    const p_user_id = setting.user_id;
    const p_starter_id = setting.starter_id;
    const p_token = setting.lease_token;
    let p_feeding_id = null;
    let p_link_id = null;
    let p_measurement_at = null;
    let p_ratio = null;
    try {
      const now = Date.now();
      const { data: event, error: eventError } = await db.from('feed_events').select('*')
        .eq('user_id', p_user_id).eq('starter_id', p_starter_id).lte('fed_at', new Date(now).toISOString())
        .order('fed_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
      if (eventError) throw eventError;
      if (event) {
        const [{ data: feeding, error: feedingError }, { data: links, error: linkError }] = await Promise.all([
          db.from('care_records').select('id,kind,starter_id,occurred_at,input').eq('id', event.care_record_id).eq('user_id', p_user_id).maybeSingle(),
          db.from('starter_device_links').select('id,starter_id,device_id,user_id,active_from,active_to')
            .eq('user_id', p_user_id).eq('starter_id', p_starter_id).is('active_to', null).lte('active_from', event.fed_at).limit(1),
        ]);
        if (feedingError) throw feedingError;
        if (linkError) throw linkError;
        const link = links?.[0] || null;
        p_feeding_id = event.id;
        p_link_id = link?.id || null;
        if (feeding && feeding.kind === 'feeding' && feeding.starter_id === p_starter_id && link) {
          const rows = [];
          const pageSize = 1000;
          for (let offset = 0; offset < 40000; offset += pageSize) {
            const { data, error } = await db.from('device_measurements')
              .select('device_id,recorded_at,temperature_c,height_mm,mode,sensor_error')
              .eq('device_id', link.device_id).gte('recorded_at', event.fed_at).lte('recorded_at', new Date(now).toISOString())
              .order('recorded_at', { ascending: true }).range(offset, offset + pageSize - 1);
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < pageSize) break;
          }
          if (rows.length >= 40000) throw new Error('measurement_limit');
          const summary = summarizeFeedingMeasurements({ measurements: rows, feeding, link, now });
          p_ratio = eligibleRatio(summary);
          p_measurement_at = summary.latestMeasurementAt;
        }
      }
    } catch {
      p_ratio = null;
      console.error('height evaluation failed');
    }
    const completed = await db.rpc('complete_height_evaluation', {
      p_user_id, p_starter_id, p_token, p_feeding_id, p_link_id, p_measurement_at, p_ratio,
    });
    if (completed.error) console.error('height evaluation commit failed', completed.error.message);
    evaluations += 1;
  }

  const due = await db.rpc('claim_height_deliveries');
  if (due.error) return json(500, { error: 'delivery_claim_failed', evaluations });
  for (const delivery of due.data || []) {
    const finish = async (status: number, delay = 60) => {
      const { error } = await db.rpc('finish_height_delivery', {
        p_id: delivery.id, p_token: delivery.lease_token, p_status: status, p_retry_seconds: delay,
      });
      if (error) console.error('delivery status update failed', error.message);
    };
    try {
      const [{ data: event, error: eventError }, { data: subscription, error: subscriptionError }] = await Promise.all([
        db.from('height_alert_events').select('target,ratio,feeding_id,starter_id,user_id').eq('id', delivery.event_id).maybeSingle(),
        db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('id', delivery.subscription_id).maybeSingle(),
      ]);
      if (eventError || subscriptionError) throw eventError || subscriptionError;
      if (!event || !subscription || !safePushEndpoint(subscription.endpoint)) { await finish(404); continue; }
      const payload = JSON.stringify({
        title: `高度已达基线的 ${event.target} 倍`,
        body: `当前高度约为基线的 ${Number(event.ratio).toFixed(2)} 倍，可回到今日页查看本轮喂养情况。`,
        tag: `ferjoo-height-${event.feeding_id}-${event.target}`,
        url: `/today?starter=${encodeURIComponent(event.starter_id)}`,
      });
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 600, timeout: 10000 });
        await finish(201);
      } catch (error) {
        const failure = error as { statusCode?: number; headers?: Record<string, string> };
        const status = Number(failure?.statusCode) || 0;
        const headers = failure?.headers || {};
        const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
        await finish(status, retryDelay(delivery.attempts, retryAfter));
      }
    } catch {
      console.error('height delivery failed');
      await finish(0, retryDelay(delivery.attempts));
    }
    deliveries += 1;
  }
  return json(200, { evaluations, deliveries });
});
