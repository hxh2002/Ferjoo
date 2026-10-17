begin;

-- 020 的早期版本把内部密钥放在旧版托管密钥扩展里。当前项目已移除该扩展，
-- 这里改为 private 配置表并替换调度函数；全部语句幂等，可重复执行。
create table if not exists private.height_push_config (
  name text primary key check (name in ('height_push_worker_url', 'height_push_internal_secret')),
  value text not null
);
alter table private.height_push_config enable row level security;
revoke all on private.height_push_config from public, anon, authenticated, service_role;

create or replace function private.dispatch_height_push() returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.height_push_config where name = 'height_push_worker_url';
  select value into v_secret from private.height_push_config where name = 'height_push_internal_secret';
  if v_url is null or v_secret is null then return; end if;
  if v_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/process-height-alerts$' then raise exception 'INVALID_WORKER_URL'; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json','x-height-push-secret',v_secret), body := '{}'::jsonb, timeout_milliseconds := 10000);
end; $$;
revoke all on function private.dispatch_height_push() from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'height-web-push') then
    perform cron.unschedule('height-web-push');
  end if;
  perform cron.schedule('height-web-push', '* * * * *', 'select private.dispatch_height_push()');
end $$;

commit;
