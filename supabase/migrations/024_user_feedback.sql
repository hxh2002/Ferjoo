begin;

-- 意见反馈只追加。用户能读自己的行，这样插入后可以取回编号并确认已落库。
create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  contact text check (contact is null or char_length(btrim(contact)) between 1 and 120),
  created_at timestamptz not null default now()
);

create index user_feedback_user_created_idx on public.user_feedback(user_id, created_at desc);

alter table public.user_feedback enable row level security;
revoke all on public.user_feedback from public, anon, authenticated;
grant select, insert on public.user_feedback to authenticated;

create policy user_feedback_select_own on public.user_feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_feedback_insert_own on public.user_feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

commit;
