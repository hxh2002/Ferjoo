begin;

-- 欢迎页 #stay 与 #contact 的落库。匿名访客只调用 submit_welcome_inquiry 写入一行。
-- 管理员按 private.is_admin() 读取。这张表不发送邮件。
create table public.welcome_inquiries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('stay', 'contact')),
  email text not null check (
    char_length(email) between 1 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  name text check (name is null or char_length(name) between 1 and 80),
  message text check (message is null or char_length(message) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint welcome_inquiries_shape check (
    (kind = 'stay' and name is null and message is null)
    or (kind = 'contact' and name is not null and message is not null)
  )
);

create index welcome_inquiries_created_idx
  on public.welcome_inquiries(created_at desc);

alter table public.welcome_inquiries enable row level security;
revoke all on public.welcome_inquiries from public, anon, authenticated;
revoke truncate on public.welcome_inquiries from public, anon, authenticated;
grant select on public.welcome_inquiries to authenticated;

drop policy if exists welcome_inquiries_select_admin on public.welcome_inquiries;
create policy welcome_inquiries_select_admin on public.welcome_inquiries
  for select to authenticated
  using (private.is_admin());

create or replace function public.submit_welcome_inquiry(
  p_kind text,
  p_email text,
  p_name text default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text := btrim(p_kind);
  v_email text := btrim(p_email);
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_id uuid;
begin
  if v_kind is distinct from 'stay' and v_kind is distinct from 'contact' then
    raise exception 'KIND_INVALID' using errcode = '22023';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED' using errcode = '22023';
  end if;
  if char_length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'EMAIL_INVALID' using errcode = '22023';
  end if;

  if v_kind = 'stay' then
    v_name := null;
    v_message := null;
  else
    if v_name is null then
      raise exception 'NAME_REQUIRED' using errcode = '22023';
    end if;
    if char_length(v_name) > 80 then
      raise exception 'NAME_TOO_LONG' using errcode = '22023';
    end if;
    if v_message is null then
      raise exception 'MESSAGE_REQUIRED' using errcode = '22023';
    end if;
    if char_length(v_message) > 2000 then
      raise exception 'MESSAGE_TOO_LONG' using errcode = '22023';
    end if;
  end if;

  insert into public.welcome_inquiries (kind, email, name, message)
  values (v_kind, v_email, v_name, v_message)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_welcome_inquiry(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_welcome_inquiry(text, text, text, text) to anon, authenticated;

commit;
