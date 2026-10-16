begin;

-- 注册真实设备 FERJOO_000003；库中只存 api_key 的 SHA-256 摘要，明文只烧录在设备上。
insert into public.devices (device_id, name, model, api_key_hash)
values (
  'FERJOO_000003',
  'Ferjoo Sensor 000003',
  'ESP32-S3',
  '79b11d8f1f7cb3846b56a472bcab33da3313abf3f001dbb7b06c775eadf1c1ea'
);

commit;
