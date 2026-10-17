begin;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 新托管项目（PG17）已移除旧版密钥保管扩展；改用 private schema 配置表存内部密钥。
-- private 不经 PostgREST 暴露，且对所有 API 角色 revoke，只有本库属主的安全定义函数能读。
create table private.height_push_config (
  name text primary key check (name in ('height_push_worker_url', 'height_push_internal_secret')),
  value text not null
);
alter table private.height_push_config enable row level security;
revoke all on private.height_push_config from public, anon, authenticated, service_role;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) < 2048 and endpoint ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com)/[^?#]+$'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}={0,2}$'),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy push_select_own on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_delete_own on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

create table public.height_alert_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  starter_id uuid not null references public.starters(id) on delete cascade,
  targets numeric[] not null default '{}' check (targets <@ array[2,2.5,3]::numeric[] and cardinality(targets) <= 3 and array_position(targets, null) is null),
  revision uuid not null default gen_random_uuid(),
  next_evaluate_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  primary key (user_id, starter_id)
);
alter table public.height_alert_settings enable row level security;
revoke all on public.height_alert_settings from public, anon, authenticated;
grant select on public.height_alert_settings to authenticated;
grant all on public.height_alert_settings to service_role;
create policy height_settings_select_own on public.height_alert_settings for select to authenticated using (user_id = (select auth.uid()));

create function public.register_push_subscription(p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_endpoint, 0));
  if exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and user_id <> p_user_id and (p256dh <> p_p256dh or auth <> p_auth)) then
    raise exception 'SUBSCRIPTION_KEY_MISMATCH' using errcode = '42501';
  end if;
  -- New ownership gets a new id: pending deliveries for the former account cascade away.
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> p_user_id;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values (p_user_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth where public.push_subscriptions.user_id = p_user_id;
end; $$;
create function public.remove_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin delete from public.push_subscriptions where user_id = auth.uid() and endpoint = p_endpoint; end; $$;
revoke all on function public.register_push_subscription(uuid,text,text,text), public.remove_push_subscription(text) from public, anon;
grant execute on function public.register_push_subscription(uuid,text,text,text), public.remove_push_subscription(text) to authenticated;

create function public.set_height_alert_targets(p_starter_id uuid, p_targets numeric[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (select 1 from public.starters where id = p_starter_id and user_id = auth.uid()) then
    raise exception 'STARTER_NOT_FOUND' using errcode = '42501';
  end if;
  if p_targets is null then raise exception 'INVALID_TARGETS'; end if;
  insert into public.height_alert_settings(user_id, starter_id, targets) values (auth.uid(), p_starter_id, p_targets)
  on conflict (user_id, starter_id) do update set targets = excluded.targets, revision = gen_random_uuid(),
    next_evaluate_at = now(), lease_token = null, lease_until = null;
end; $$;
revoke all on function public.set_height_alert_targets(uuid, numeric[]) from public, anon, authenticated;
grant execute on function public.set_height_alert_targets(uuid, numeric[]) to authenticated;

create table public.height_alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starter_id uuid not null references public.starters(id) on delete cascade,
  feeding_id uuid not null references public.feed_events(id) on delete cascade,
  link_id uuid not null references public.starter_device_links(id) on delete cascade,
  target numeric not null check (target in (2,2.5,3)),
  ratio numeric not null check (ratio >= target),
  measurement_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, starter_id, feeding_id, target)
);
create table public.height_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.height_alert_events(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','sending','sent','dead')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_status integer,
  unique (event_id, subscription_id)
);
create index height_deliveries_due on public.height_push_deliveries(next_attempt_at) where state in ('pending','sending');
alter table public.height_alert_events enable row level security;
alter table public.height_push_deliveries enable row level security;
revoke all on public.height_alert_events, public.height_push_deliveries from public, anon, authenticated;
grant all on public.height_alert_events, public.height_push_deliveries to service_role;

-- Poll committed current state, not individual upload rows: INSERT and UPDATE/upsert,
-- unordered batches and historical backfills all use the same latest-round decision.
create function public.claim_height_evaluations() returns setof public.height_alert_settings
language sql security definer set search_path = public, pg_temp as $$
  with due as (
    select user_id, starter_id from public.height_alert_settings s
    where cardinality(targets) > 0 and next_evaluate_at <= now() and (lease_until is null or lease_until < now())
      and exists (select 1 from public.push_subscriptions p where p.user_id = s.user_id)
    order by next_evaluate_at for update skip locked limit 5
  )
  update public.height_alert_settings s set lease_token = gen_random_uuid(), lease_until = now() + interval '3 minutes', next_evaluate_at = now() + interval '1 minute'
  from due where s.user_id = due.user_id and s.starter_id = due.starter_id returning s.*;
$$;

-- Event insertion and subscriber fan-out commit together; lease/revision fences stale workers.
create function public.complete_height_evaluation(p_user_id uuid, p_starter_id uuid, p_token uuid, p_feeding_id uuid default null, p_link_id uuid default null, p_measurement_at timestamptz default null, p_ratio numeric default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.height_alert_settings%rowtype; f public.feed_events%rowtype; v_event uuid; v_target numeric;
begin
  select * into s from public.height_alert_settings where user_id = p_user_id and starter_id = p_starter_id for update;
  if s.lease_token is distinct from p_token or s.lease_until <= now() then return; end if;
  select * into f from public.feed_events where user_id = p_user_id and starter_id = p_starter_id and fed_at <= now() order by fed_at desc, id desc limit 1;
  if f.id = p_feeding_id and p_ratio > 0 and p_ratio < 'Infinity'::numeric
    and p_measurement_at > f.fed_at + interval '50 minutes' and p_measurement_at <= now() and p_measurement_at >= now() - interval '40 minutes'
    and not exists (select 1 from public.feed_events n where n.user_id = p_user_id and n.starter_id = p_starter_id and n.id <> f.id and n.fed_at = f.fed_at)
    and exists (select 1 from public.starter_device_links l join public.device_members m on m.device_id = l.device_id and m.user_id = l.user_id
      where l.id = p_link_id and l.user_id = p_user_id and l.starter_id = p_starter_id and l.active_to is null and l.active_from <= f.fed_at) then
    foreach v_target in array s.targets loop
      if p_ratio >= v_target then
        v_event := null;
        insert into public.height_alert_events(user_id, starter_id, feeding_id, link_id, target, ratio, measurement_at)
          values (p_user_id, p_starter_id, f.id, p_link_id, v_target, p_ratio, p_measurement_at)
          on conflict (user_id, starter_id, feeding_id, target) do nothing returning id into v_event;
        if v_event is null then
          select id into v_event from public.height_alert_events where user_id = p_user_id and starter_id = p_starter_id and feeding_id = f.id and target = v_target;
        end if;
        if v_event is not null then
          insert into public.height_push_deliveries(event_id, subscription_id)
            select v_event, p.id from public.push_subscriptions p where p.user_id = p_user_id
            on conflict (event_id, subscription_id) do nothing;
        end if;
      end if;
    end loop;
  end if;
  update public.height_alert_settings set lease_token = null, lease_until = null where user_id = p_user_id and starter_id = p_starter_id;
end; $$;

create function public.claim_height_deliveries() returns setof public.height_push_deliveries
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.height_push_deliveries d set state = 'dead', lease_token = null, lease_until = null
  where state in ('pending','sending') and (lease_until is null or lease_until < now()) and (attempts >= 5 or not exists (
    select 1 from public.height_alert_events e
    join public.height_alert_settings s on s.user_id = e.user_id and s.starter_id = e.starter_id
    join public.starter_device_links l on l.id = e.link_id
    join public.device_members m on m.device_id = l.device_id and m.user_id = e.user_id
    where e.id = d.event_id and e.target = any(s.targets) and l.active_to is null
      and e.measurement_at >= now() - interval '40 minutes'
      and not exists (select 1 from public.feed_events n where n.user_id = e.user_id and n.starter_id = e.starter_id and n.id <> e.feeding_id
        and n.fed_at >= (select fed_at from public.feed_events where id = e.feeding_id) and n.fed_at <= now())
  ));
  return query with due as (
    select id from public.height_push_deliveries where state in ('pending','sending') and attempts < 5 and next_attempt_at <= now()
      and (lease_until is null or lease_until < now()) order by next_attempt_at for update skip locked limit 10
  ) update public.height_push_deliveries d set state = 'sending', attempts = attempts + 1, lease_token = gen_random_uuid(), lease_until = now() + interval '3 minutes'
    from due where d.id = due.id returning d.*;
end; $$;

create function public.finish_height_delivery(p_id uuid, p_token uuid, p_status integer, p_retry_seconds integer default 60)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.height_push_deliveries%rowtype;
begin
  select * into d from public.height_push_deliveries where id = p_id for update;
  if d.lease_token is distinct from p_token or d.state <> 'sending' or d.lease_until <= now() then return; end if;
  if p_status in (404,410) then
    delete from public.push_subscriptions where id = d.subscription_id;
    return;
  end if;
  update public.height_push_deliveries set
    state = case when p_status between 200 and 299 then 'sent'
      when attempts < 5 and (p_status = 0 or p_status = 429 or p_status between 500 and 599) then 'pending' else 'dead' end,
    next_attempt_at = now() + make_interval(secs => greatest(30, least(3600, coalesce(p_retry_seconds,60)))),
    last_status = p_status, lease_token = null, lease_until = null where id = p_id;
end; $$;

revoke all on function public.claim_height_evaluations() from public, anon, authenticated;
revoke all on function public.complete_height_evaluation(uuid,uuid,uuid,uuid,uuid,timestamptz,numeric) from public, anon, authenticated;
revoke all on function public.claim_height_deliveries() from public, anon, authenticated;
revoke all on function public.finish_height_delivery(uuid,uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_height_evaluations(), public.complete_height_evaluation(uuid,uuid,uuid,uuid,uuid,timestamptz,numeric), public.claim_height_deliveries(), public.finish_height_delivery(uuid,uuid,integer,integer) to service_role;

create function private.dispatch_height_push() returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.height_push_config where name = 'height_push_worker_url';
  select value into v_secret from private.height_push_config where name = 'height_push_internal_secret';
  if v_url is null or v_secret is null then return; end if;
  if v_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/process-height-alerts$' then raise exception 'INVALID_WORKER_URL'; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-height-push-secret',v_secret), body := '{}'::jsonb, timeout_milliseconds := 10000);
end; $$;
revoke all on function private.dispatch_height_push() from public, anon, authenticated, service_role;
select cron.schedule('height-web-push', '* * * * *', 'select private.dispatch_height_push()');

commit;
