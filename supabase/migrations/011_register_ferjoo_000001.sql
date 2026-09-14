begin;

-- 注册真实设备 FERJOO_000001；库中只存 api_key 的 SHA-256 摘要，明文只烧录在设备上。
insert into public.devices (device_id, name, model, api_key_hash)
values (
  'FERJOO_000001',
  'Ferjoo Sensor 000001',
  'ESP32-S3',
  '5dd97e8bcffc25ebfd825c1a94efa3ac5bfd2c99e555ba4ec04b584ed91b055a'
);

commit;
