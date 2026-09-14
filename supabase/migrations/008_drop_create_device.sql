begin;

-- ============================================================================
-- 008 · 下线 create_device RPC
--
-- 背景：设备创建统一为出厂通道——管理员 SQL 批量插入 devices 行（无主），
--       用户凭绑定码经 claim_device 认领（首个绑定者为 owner）。
--       网页端「出生即绑定创建者」的 create_device 路径不再保留，
--       直接删除函数（execute 权限随函数一并消失）。
-- ============================================================================
drop function if exists public.create_device(varchar, varchar, varchar);

commit;
