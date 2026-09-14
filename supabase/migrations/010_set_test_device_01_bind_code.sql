begin;

-- 绑定码使用与生成器相同的字母表（无 0/O/1/I/L 混淆字符）。
update public.devices
set bind_code = 'NCU9BXBF'
where device_id = 'dev_test_01';

commit;
