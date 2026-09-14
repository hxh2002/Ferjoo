begin;

insert into public.devices (device_id, name, model, api_key_hash)
values (
  'dev_test_01',
  'Ferjoo Test Device 01',
  'ESP32-S3',
  'e34c11c1f01d06f07d4421712a01b727659da1f7fdbf28da0535acc06ee731e7'
);

commit;
