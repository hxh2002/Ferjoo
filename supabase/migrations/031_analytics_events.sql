begin;

-- 产品行为事件只追加：不采集密码、令牌、邀请码、诊断自由文本或传感器原始数据。
-- client_event_id 让同一次操作的安全重试保持幂等；user_id 只能由登录会话确定。
create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_event_id uuid not null,
  event_name varchar(80) not null
    constraint analytics_events_name_check check (event_name ~ '^[a-z][a-z0-9_]{1,79}$'),
  session_id uuid not null,
  page varchar(80) not null
    constraint analytics_events_page_check check (page ~ '^[a-z][a-z0-9_/-]{0,79}$'),
  properties jsonb not null default '{}'::jsonb
    constraint analytics_events_properties_check check (
      jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 8192
    ),
  occurred_at timestamptz not null
    constraint analytics_events_occurred_at_check check (
      occurred_at >= '2026-01-01T00:00:00Z'::timestamptz
      and occurred_at <= now() + interval '5 minutes'
    ),
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id)
);

create index analytics_events_user_time_idx
  on public.analytics_events(user_id, occurred_at desc);
create index analytics_events_event_time_idx
  on public.analytics_events(event_name, occurred_at desc);

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;
revoke truncate on public.analytics_events from public, anon, authenticated;
grant select, insert, update, delete on public.analytics_events to authenticated;

create policy analytics_events_select_own_or_admin on public.analytics_events
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

create policy analytics_events_insert_own on public.analytics_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 普通用户不能修改或删除历史事件；管理角色可在需要时治理数据。
create policy analytics_events_update_admin on public.analytics_events
  for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy analytics_events_delete_admin on public.analytics_events
  for delete to authenticated
  using (private.is_admin());

commit;
