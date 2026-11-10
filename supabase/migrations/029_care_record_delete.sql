begin;

-- 029_care_record_delete.sql
--
-- 与 015 / 018 / 023 / 025 / 027 / 028 的关系：
--   * 015 只给 care_records 授予 select / insert（记录是不可变快照）；
--   * 025 显式 revoke update / delete / truncate，027 把「删除酵种」改成归档，028 把历史外键改成 restrict；
--   * 本文件为「删除单条记录」开一个最小口子：只加 delete，不加 update，并用 RLS 限定到本人行。
--
-- 为什么是「直接授权 + delete 策略」而不是 RPC：
--   * 015 的 save_care_record 本身是 security invoker，写入归属完全交给 insert 策略；
--     删除同样只需要「本人行」这一条边界，单表单行 delete 没有跨表校验或事务编排的需求；
--   * 023 的 close_fermentation_window 用 security definer，是因为它要读同一酵种的下一次喂养来夹取结束时间；
--     删除没有这类读取，改成 definer 反而会把「能删谁的行」的判断藏进函数体，策略比函数更容易审计；
--   * 前端就是一条 `.delete().eq('id', …).eq('user_id', …)`，多包一层 RPC 不带来额外约束。
--
-- 依赖表行为（依据 018 / 020 / 023 的真实定义，不是猜的名字）：
--   * feed_events.care_record_id → care_records(id) on delete cascade：喂养派生事实（含起始高度）随记录删除；
--   * fermentation_window_closures.feeding_id → care_records(id) on delete cascade：手动结束时刻随记录删除；
--   * height_alert_events.feeding_id → feed_events(id) on delete cascade，
--     height_push_deliveries.event_id → height_alert_events(id) on delete cascade：提醒事件与待投递消息一并清掉，
--     不会留下指向已删除轮次的通知。
--   这些级联由外键的参照动作执行（以表属主身份运行），不受调用者 delete 授权限制，所以 feed_events /
--   fermentation_window_closures / height_alert_* 都不需要额外授权，也不会因为缺少 delete 权限而卡住。
--   028 只把「指向 devices / starters / auth.users」的外键改为 restrict，指向 care_records 的仍是 cascade，
--   删除单条记录不会被 028 拦住；care_records 自己的 user_id / starter_id 外键方向也不参与本次删除。
--   注意：若今后对上述依赖表开启 force row level security，级联会改按依赖表的策略校验，需要重评这段结论。
--
-- 语义边界（有意为之）：
--   * 删除是硬删除，删除后该轮喂养不再参与轮次归因：相邻两轮会按剩余的喂养记录重新划定窗口，
--     这不写任何补偿行（窗口本来就是按 care_records 现算的，见 023 的注释）；
--   * 只删 care_records 行，不动 starters / starter_device_links / device_measurements 的历史；
--   * 前端必须二次确认（MConfirmDialog danger），因为设备证据与曲线无法恢复。

-- 只加 delete：update 继续收回（记录是不可变快照），truncate 更不允许。
revoke update, truncate on public.care_records from public, anon, authenticated;
revoke delete on public.care_records from public, anon;
grant delete on public.care_records to authenticated;

-- 幂等：重复执行安全。
drop policy if exists care_records_delete_own on public.care_records;
create policy care_records_delete_own on public.care_records
  for delete to authenticated using (user_id = (select auth.uid()));

commit;
