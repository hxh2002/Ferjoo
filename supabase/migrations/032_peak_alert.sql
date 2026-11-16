begin;

-- 过峰提醒：沿用高度提醒的评估 / 投递链路，事件按 kind 区分倍数提醒与过峰提醒。
-- Peak 由 rise-phase 在峰后连续回落时反推锁定，因此提醒天然晚于实际峰值（约 lockDrops × 采样间隔）。
alter table public.height_alert_settings add column if not exists peak_alert boolean not null default false;

alter table public.height_alert_events add column if not exists kind text not null default 'ratio';
alter table public.height_alert_events add column if not exists peak_ratio numeric;
alter table public.height_alert_events add column if not exists peak_at timestamptz;
alter table public.height_alert_events alter column target drop not null;

-- 020 的 target / ratio 列约束与 (…, target) 唯一约束是自动命名的，这里按类型清掉后统一重建，可重复执行。
do $$
declare v_name text;
begin
  for v_name in select conname from pg_constraint where conrelid = 'public.height_alert_events'::regclass and contype in ('c','u') loop
    execute format('alter table public.height_alert_events drop constraint %I', v_name);
  end loop;
end $$;
alter table public.height_alert_events add constraint height_alert_events_kind_check check (
  (kind = 'ratio' and target in (2,2.5,3) and ratio >= target and peak_ratio is null and peak_at is null)
  or (kind = 'peak' and target is null and ratio > 0 and peak_ratio > 0 and peak_at is not null)
);
-- 每轮喂养每个倍数一条、过峰一条；过峰事件 target 为空，需 nulls not distinct 才能去重。
alter table public.height_alert_events add constraint height_alert_events_round_key
  unique nulls not distinct (user_id, starter_id, feeding_id, kind, target);

create or replace function public.set_peak_alert(p_starter_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (select 1 from public.starters where id = p_starter_id and user_id = auth.uid()) then
    raise exception 'STARTER_NOT_FOUND' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'INVALID_PEAK_ALERT'; end if;
  insert into public.height_alert_settings(user_id, starter_id, peak_alert) values (auth.uid(), p_starter_id, p_enabled)
  on conflict (user_id, starter_id) do update set peak_alert = excluded.peak_alert, revision = gen_random_uuid(),
    next_evaluate_at = now(), lease_token = null, lease_until = null;
end; $$;
revoke all on function public.set_peak_alert(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_peak_alert(uuid, boolean) to authenticated;

create or replace function public.claim_height_evaluations() returns setof public.height_alert_settings
language sql security definer set search_path = public, pg_temp as $$
  with due as (
    select user_id, starter_id from public.height_alert_settings s
    where (cardinality(targets) > 0 or peak_alert) and next_evaluate_at <= now() and (lease_until is null or lease_until < now())
      and exists (select 1 from public.push_subscriptions p where p.user_id = s.user_id)
    order by next_evaluate_at for update skip locked limit 5
  )
  update public.height_alert_settings s set lease_token = gen_random_uuid(), lease_until = now() + interval '3 minutes', next_evaluate_at = now() + interval '1 minute'
  from due where s.user_id = due.user_id and s.starter_id = due.starter_id returning s.*;
$$;

drop function if exists public.complete_height_evaluation(uuid,uuid,uuid,uuid,uuid,timestamptz,numeric);
create or replace function public.complete_height_evaluation(p_user_id uuid, p_starter_id uuid, p_token uuid, p_feeding_id uuid default null, p_link_id uuid default null, p_measurement_at timestamptz default null, p_ratio numeric default null, p_peak_at timestamptz default null, p_peak_ratio numeric default null)
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
        insert into public.height_alert_events(user_id, starter_id, feeding_id, link_id, kind, target, ratio, measurement_at)
          values (p_user_id, p_starter_id, f.id, p_link_id, 'ratio', v_target, p_ratio, p_measurement_at)
          on conflict on constraint height_alert_events_round_key do nothing returning id into v_event;
        if v_event is null then
          select id into v_event from public.height_alert_events where user_id = p_user_id and starter_id = p_starter_id and feeding_id = f.id and kind = 'ratio' and target = v_target;
        end if;
        if v_event is not null then
          insert into public.height_push_deliveries(event_id, subscription_id)
            select v_event, p.id from public.push_subscriptions p where p.user_id = p_user_id
            on conflict (event_id, subscription_id) do nothing;
        end if;
      end if;
    end loop;
    -- 过峰每轮只在首次锁定时提醒：反弹后重新锁定、或晚开开关时峰值已久远，都不再补发。
    if s.peak_alert and p_peak_at is not null and p_peak_ratio > 0 and p_peak_ratio < 'Infinity'::numeric
      and p_peak_at >= f.fed_at and p_peak_at <= p_measurement_at and p_peak_at >= now() - interval '90 minutes' then
      v_event := null;
      insert into public.height_alert_events(user_id, starter_id, feeding_id, link_id, kind, target, ratio, peak_ratio, peak_at, measurement_at)
        values (p_user_id, p_starter_id, f.id, p_link_id, 'peak', null, p_ratio, p_peak_ratio, p_peak_at, p_measurement_at)
        on conflict on constraint height_alert_events_round_key do nothing returning id into v_event;
      if v_event is not null then
        insert into public.height_push_deliveries(event_id, subscription_id)
          select v_event, p.id from public.push_subscriptions p where p.user_id = p_user_id
          on conflict (event_id, subscription_id) do nothing;
      end if;
    end if;
  end if;
  update public.height_alert_settings set lease_token = null, lease_until = null where user_id = p_user_id and starter_id = p_starter_id;
end; $$;
revoke all on function public.complete_height_evaluation(uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,timestamptz,numeric) from public, anon, authenticated;
grant execute on function public.complete_height_evaluation(uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,timestamptz,numeric) to service_role;

create or replace function public.claim_height_deliveries() returns setof public.height_push_deliveries
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.height_push_deliveries d set state = 'dead', lease_token = null, lease_until = null
  where state in ('pending','sending') and (lease_until is null or lease_until < now()) and (attempts >= 5 or not exists (
    select 1 from public.height_alert_events e
    join public.height_alert_settings s on s.user_id = e.user_id and s.starter_id = e.starter_id
    join public.starter_device_links l on l.id = e.link_id
    join public.device_members m on m.device_id = l.device_id and m.user_id = e.user_id
    where e.id = d.event_id and ((e.kind = 'ratio' and e.target = any(s.targets)) or (e.kind = 'peak' and s.peak_alert)) and l.active_to is null
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

commit;
