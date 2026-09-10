begin;

-- 007 · 绑定码默认值兜底
-- 让出厂批量 SQL 直接 INSERT devices（不指定 bind_code）时也自动签发绑定码，
-- create_device RPC 仍然显式生成，二者并存不冲突。
alter table public.devices
  alter column bind_code set default private.generate_bind_code();

commit;
