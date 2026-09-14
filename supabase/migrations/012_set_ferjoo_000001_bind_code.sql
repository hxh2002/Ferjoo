begin;

-- 为 FERJOO_000001 指定绑定码（字母表无 0/O/1/I/L 混淆字符）。
update public.devices
set bind_code = 'PFVFEV5G'
where device_id = 'FERJOO_000001';

commit;
