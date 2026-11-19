import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { ADMIN_PAGE_SIZE, adminErrorMessage, ilikeTerm } from '../lib/admin-access.js';
import { ANALYTICS_SUMMARY_LIMIT, analyticsFilter, summarizeAnalytics } from '../lib/analytics-report.js';

const USER_FIELDS = 'id, system_user_id, role, is_super_admin, email, display_name, created_at, invite_quota, invited_count, invited_by, gender, birth_date, profile_identity';
const DEVICE_FIELDS = 'device_id, name, model, firmware_version, bind_code, last_seen_at, created_at, updated_at';

function requireClient() {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase 尚未配置。');
  return supabase;
}

async function run(operation) {
  try {
    return await operation();
  } catch (error) {
    const wrapped = new Error(adminErrorMessage(error));
    wrapped.cause = error;
    throw wrapped;
  }
}

async function assertAdmin(client) {
  const userResult = await client.auth.getUser();
  if (userResult.error) throw userResult.error;
  const userId = userResult.data.user?.id;
  if (!userId) {
    const error = new Error('AUTH_REQUIRED');
    error.code = 'PGRST301';
    throw error;
  }
  const result = await client.from('profiles').select('id, role, is_super_admin').eq('id', userId).single();
  if (result.error) throw result.error;
  if (result.data.role !== 'A') {
    const error = new Error('FORBIDDEN');
    error.code = '42501';
    throw error;
  }
  return result.data;
}

function assertSuper(actor) {
  if (!actor.is_super_admin) {
    const error = new Error('FORBIDDEN');
    error.code = '42501';
    throw error;
  }
}

function pageWindow(page) {
  const safePage = Number.isInteger(page) && page > 0 ? page : 0;
  const from = safePage * ADMIN_PAGE_SIZE;
  return { page: safePage, from, to: from + ADMIN_PAGE_SIZE - 1 };
}

function paged(rows, count, page) {
  return { rows: rows || [], total: count || 0, page };
}

async function profilesByIds(client, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await client.from('profiles').select('id, system_user_id, display_name, email, role, is_super_admin').in('id', unique);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}

async function startersByIds(client, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await client.from('starters').select('id, name, archived_at, user_id').in('id', unique);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}

async function devicesByIds(client, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await client.from('devices').select(DEVICE_FIELDS).in('device_id', unique);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.device_id, row]));
}

async function matchingProfileIds(client, term) {
  const { data, error } = await client
    .from('profiles')
    .select('id')
    .or(`email.ilike.%${term}%,display_name.ilike.%${term}%,system_user_id.ilike.%${term}%`)
    .limit(100);
  if (error) throw error;
  return (data || []).map((row) => row.id);
}

async function matchingStarterIds(client, term) {
  const { data, error } = await client.from('starters').select('id').ilike('name', `%${term}%`).limit(100);
  if (error) throw error;
  return (data || []).map((row) => row.id);
}

async function matchingDeviceIds(client, term) {
  const { data, error } = await client.from('devices').select('device_id').or(`device_id.ilike.%${term}%,name.ilike.%${term}%`).limit(100);
  if (error) throw error;
  return (data || []).map((row) => row.device_id);
}

function applyIdSearch(query, term, groups) {
  if (!term) return { query, empty: false };
  const parts = groups.filter((group) => group.ids.length).map((group) => `${group.column}.in.(${group.ids.join(',')})`);
  if (!parts.length) return { query, empty: true };
  return { query: query.or(parts.join(',')), empty: false };
}

export function fetchOverview() {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const { data, error } = await client.rpc('admin_overview');
    if (error) throw error;
    return data || {};
  });
}

export function listUsers({ query = '', role = 'all', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const term = ilikeTerm(query);
    let request = client.from('profiles').select(USER_FIELDS, { count: 'exact' });
    if (role === 'A' || role === 'U') request = request.eq('role', role);
    if (term) request = request.or(`email.ilike.%${term}%,display_name.ilike.%${term}%,system_user_id.ilike.%${term}%`);
    const { data, error, count } = await request.order('created_at', { ascending: false }).range(window.from, window.to);
    if (error) throw error;
    return paged(data, count, window.page);
  });
}

export function getUser(userId) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const { data: profile, error } = await client.from('profiles').select(USER_FIELDS).eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!profile) {
      const missing = new Error('NOT_FOUND');
      throw missing;
    }
    const [members, starters, feedings, inviter] = await Promise.all([
      client.from('device_members').select('device_id, role, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
      client.from('starters').select('id, name, created_at, archived_at').eq('user_id', userId).order('created_at', { ascending: false }),
      client.from('care_records').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'feeding'),
      profile.invited_by
        ? client.from('profiles').select('id, system_user_id, display_name, email').eq('id', profile.invited_by).maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);
    if (members.error) throw members.error;
    if (starters.error) throw starters.error;
    if (feedings.error) throw feedings.error;
    if (inviter.error) throw inviter.error;
    const devices = await devicesByIds(client, (members.data || []).map((row) => row.device_id));
    return {
      profile,
      inviter: inviter.data,
      feedingCount: feedings.count || 0,
      starters: starters.data || [],
      bindings: (members.data || []).map((row) => ({ ...row, device: devices.get(row.device_id) || null }))
    };
  });
}

export function setUserRole(userId, role) {
  return run(async () => {
    const client = requireClient();
    assertSuper(await assertAdmin(client));
    const { data, error } = await client.rpc('admin_set_role', { p_user_id: userId, p_role: role });
    if (error) throw error;
    return data;
  });
}

export function createAccount({ email, password, displayName }) {
  return run(async () => {
    const client = requireClient();
    assertSuper(await assertAdmin(client));
    const { data, error } = await client.rpc('admin_create_account', {
      p_email: String(email || '').trim(),
      p_password: password,
      p_display_name: String(displayName || '').trim() || null
    });
    if (error) throw error;
    return data;
  });
}

export function listBindings({ query = '', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const term = ilikeTerm(query);
    let request = client.from('device_members').select('device_id, user_id, role, created_at', { count: 'exact' });
    if (term) {
      const [userIds, deviceIds] = await Promise.all([matchingProfileIds(client, term), matchingDeviceIds(client, term)]);
      const applied = applyIdSearch(request, term, [{ column: 'user_id', ids: userIds }, { column: 'device_id', ids: deviceIds }]);
      if (applied.empty) return paged([], 0, window.page);
      request = applied.query;
    }
    const { data, error, count } = await request.order('created_at', { ascending: false }).range(window.from, window.to);
    if (error) throw error;
    const [profiles, devices] = await Promise.all([
      profilesByIds(client, (data || []).map((row) => row.user_id)),
      devicesByIds(client, (data || []).map((row) => row.device_id))
    ]);
    return paged((data || []).map((row) => ({
      ...row,
      profile: profiles.get(row.user_id) || null,
      device: devices.get(row.device_id) || null
    })), count, window.page);
  });
}

export function listStarterLinks({ query = '', active = 'active', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const term = ilikeTerm(query);
    let request = client.from('starter_device_links').select('id, starter_id, device_id, user_id, active_from, active_to, created_at', { count: 'exact' });
    if (active === 'active') request = request.is('active_to', null);
    if (active === 'ended') request = request.not('active_to', 'is', null);
    if (term) {
      const [userIds, deviceIds, starterIds] = await Promise.all([
        matchingProfileIds(client, term),
        matchingDeviceIds(client, term),
        matchingStarterIds(client, term)
      ]);
      const applied = applyIdSearch(request, term, [
        { column: 'user_id', ids: userIds },
        { column: 'device_id', ids: deviceIds },
        { column: 'starter_id', ids: starterIds }
      ]);
      if (applied.empty) return paged([], 0, window.page);
      request = applied.query;
    }
    const { data, error, count } = await request.order('active_from', { ascending: false }).range(window.from, window.to);
    if (error) throw error;
    const [profiles, devices, starters] = await Promise.all([
      profilesByIds(client, (data || []).map((row) => row.user_id)),
      devicesByIds(client, (data || []).map((row) => row.device_id)),
      startersByIds(client, (data || []).map((row) => row.starter_id))
    ]);
    return paged((data || []).map((row) => ({
      ...row,
      profile: profiles.get(row.user_id) || null,
      device: devices.get(row.device_id) || null,
      starter: starters.get(row.starter_id) || null
    })), count, window.page);
  });
}

export function listRounds({ query = '', status = 'all', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const { data, error } = await client.rpc('admin_list_rounds', {
      p_query: String(query || '').trim().slice(0, 80),
      p_status: status === 'active' || status === 'closed' ? status : 'all',
      p_limit: ADMIN_PAGE_SIZE,
      p_offset: window.from
    });
    if (error) throw error;
    return { rows: data?.rows || [], total: data?.total || 0, page: window.page };
  });
}

export function getRound(id) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const { data, error } = await client.rpc('admin_get_round', { p_id: id });
    if (error) throw error;
    return data;
  });
}

export function listDevices({ query = '', presence = 'all', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const term = ilikeTerm(query);
    const cutoff = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    let request = client.from('devices').select(DEVICE_FIELDS, { count: 'exact' });
    if (presence === 'online') request = request.gte('last_seen_at', cutoff);
    if (presence === 'offline') request = request.lt('last_seen_at', cutoff);
    if (presence === 'never') request = request.is('last_seen_at', null);
    if (term) request = request.or(`device_id.ilike.%${term}%,name.ilike.%${term}%`);
    const { data, error, count } = await request.order('created_at', { ascending: false }).range(window.from, window.to);
    if (error) throw error;
    const ids = (data || []).map((row) => row.device_id);
    let memberRows = [];
    if (ids.length) {
      const members = await client.from('device_members').select('device_id').in('device_id', ids);
      if (members.error) throw members.error;
      memberRows = members.data || [];
    }
    const counts = new Map();
    for (const row of memberRows) counts.set(row.device_id, (counts.get(row.device_id) || 0) + 1);
    return paged((data || []).map((row) => ({ ...row, member_count: counts.get(row.device_id) || 0 })), count, window.page);
  });
}

export function getDevice(deviceId) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const [device, members, links, latest] = await Promise.all([
      client.from('devices').select(DEVICE_FIELDS).eq('device_id', deviceId).maybeSingle(),
      client.from('device_members').select('device_id, user_id, role, created_at').eq('device_id', deviceId).order('created_at', { ascending: true }),
      client.from('starter_device_links').select('id, starter_id, user_id, active_from, active_to').eq('device_id', deviceId).order('active_from', { ascending: false }).limit(20),
      client.from('device_latest_measurements').select('device_id, recorded_at, temperature_c, height_mm, humidity_percent, battery_percent').eq('device_id', deviceId).maybeSingle()
    ]);
    if (device.error) throw device.error;
    if (!device.data) throw new Error('NOT_FOUND');
    if (members.error) throw members.error;
    if (links.error) throw links.error;
    if (latest.error) throw latest.error;
    const [profiles, starters] = await Promise.all([
      profilesByIds(client, [...(members.data || []), ...(links.data || [])].map((row) => row.user_id)),
      startersByIds(client, (links.data || []).map((row) => row.starter_id))
    ]);
    return {
      device: device.data,
      latest: latest.data,
      members: (members.data || []).map((row) => ({ ...row, profile: profiles.get(row.user_id) || null })),
      links: (links.data || []).map((row) => ({
        ...row,
        profile: profiles.get(row.user_id) || null,
        starter: starters.get(row.starter_id) || null
      }))
    };
  });
}

export function renameDevice(deviceId, name) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const next = String(name || '').trim();
    if (next.length > 80) throw new Error('INVALID_NAME');
    const { data, error } = await client.from('devices').update({ name: next || null }).eq('device_id', deviceId).select('device_id, name').single();
    if (error) throw error;
    return data;
  });
}

export function listStarters({ query = '', archived = 'active', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const term = ilikeTerm(query);
    let request = client.from('starters').select('id, user_id, name, created_at, archived_at', { count: 'exact' });
    if (archived === 'active') request = request.is('archived_at', null);
    if (archived === 'archived') request = request.not('archived_at', 'is', null);
    if (term) {
      const userIds = await matchingProfileIds(client, term);
      const parts = [`name.ilike.%${term}%`];
      if (userIds.length) parts.push(`user_id.in.(${userIds.join(',')})`);
      request = request.or(parts.join(','));
    }
    const { data, error, count } = await request.order('created_at', { ascending: false }).range(window.from, window.to);
    if (error) throw error;
    const profiles = await profilesByIds(client, (data || []).map((row) => row.user_id));
    const starterIds = (data || []).map((row) => row.id);
    let linkRows = [];
    if (starterIds.length) {
      const links = await client.from('starter_device_links').select('starter_id, device_id').in('starter_id', starterIds).is('active_to', null);
      if (links.error) throw links.error;
      linkRows = links.data || [];
    }
    const devices = await devicesByIds(client, linkRows.map((row) => row.device_id));
    const linkByStarter = new Map(linkRows.map((row) => [row.starter_id, row]));
    return paged((data || []).map((row) => {
      const link = linkByStarter.get(row.id);
      return { ...row, profile: profiles.get(row.user_id) || null, device: link ? devices.get(link.device_id) || { device_id: link.device_id } : null };
    }), count, window.page);
  });
}

export function listDiagnoses({ query = '', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const term = ilikeTerm(query);
    let request = client.from('care_records').select('id, user_id, starter_id, occurred_at, created_at, result', { count: 'exact' }).eq('kind', 'observation');
    if (term) {
      const [userIds, starterIds] = await Promise.all([matchingProfileIds(client, term), matchingStarterIds(client, term)]);
      const applied = applyIdSearch(request, term, [{ column: 'user_id', ids: userIds }, { column: 'starter_id', ids: starterIds }]);
      if (applied.empty) return paged([], 0, window.page);
      request = applied.query;
    }
    const { data, error, count } = await request.order('occurred_at', { ascending: false }).range(window.from, window.to);
    if (error) throw error;
    const [profiles, starters] = await Promise.all([
      profilesByIds(client, (data || []).map((row) => row.user_id)),
      startersByIds(client, (data || []).map((row) => row.starter_id))
    ]);
    return paged((data || []).map((row) => ({
      ...row,
      profile: profiles.get(row.user_id) || null,
      starter: starters.get(row.starter_id) || null
    })), count, window.page);
  });
}

export function listFeedback({ query = '', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const term = ilikeTerm(query);
    let request = client.from('user_feedback').select('id, user_id, content, contact, created_at', { count: 'exact' });
    if (term) {
      const userIds = await matchingProfileIds(client, term);
      const parts = [`content.ilike.%${term}%`];
      if (userIds.length) parts.push(`user_id.in.(${userIds.join(',')})`);
      request = request.or(parts.join(','));
    }
    const { data, error, count } = await request.order('created_at', { ascending: false }).range(window.from, window.to);
    if (error) throw error;
    const profiles = await profilesByIds(client, (data || []).map((row) => row.user_id));
    return paged((data || []).map((row) => ({ ...row, profile: profiles.get(row.user_id) || null })), count, window.page);
  });
}

const ANALYTICS_FIELDS = 'id, user_id, event_name, session_id, page, properties, occurred_at';

export function listAnalyticsEvents({ since, event = '', pageName = '', page = 0 } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    const window = pageWindow(page);
    const eventName = analyticsFilter(event, 'event');
    const pageFilter = analyticsFilter(pageName, 'page');
    let request = client.from('analytics_events').select(ANALYTICS_FIELDS, { count: 'exact' });
    if (since) request = request.gte('occurred_at', since);
    if (eventName) request = request.eq('event_name', eventName);
    if (pageFilter) request = request.eq('page', pageFilter);
    const { data, error, count } = await request.order('occurred_at', { ascending: false }).range(window.from, window.to);
    if (error) throw error;
    const profiles = await profilesByIds(client, (data || []).map((row) => row.user_id));
    return paged((data || []).map((row) => ({ ...row, profile: profiles.get(row.user_id) || null })), count, window.page);
  });
}

export function loadAnalyticsSummary({ since } = {}) {
  return run(async () => {
    const client = requireClient();
    await assertAdmin(client);
    let request = client.from('analytics_events').select('user_id, event_name, page, properties, occurred_at');
    if (since) request = request.gte('occurred_at', since);
    const { data, error } = await request.order('occurred_at', { ascending: false }).limit(ANALYTICS_SUMMARY_LIMIT);
    if (error) throw error;
    const rows = data || [];
    return { ...summarizeAnalytics(rows), truncated: rows.length >= ANALYTICS_SUMMARY_LIMIT };
  });
}
