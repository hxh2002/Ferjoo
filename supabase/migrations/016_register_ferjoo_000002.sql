begin;

-- 注册真实设备 FERJOO_000002；库中只存 api_key 的 SHA-256 摘要，明文只烧录在设备上。
insert into public.devices (device_id, name, model, api_key_hash)
values (
  'FERJOO_000002',
  'Ferjoo Sensor 000002',
  'ESP32-S3',
  'bf9efbd6f90815a6b55f5379611686a94dd8821e562f3dc4954e23dfb882fc76'
);

commit;
