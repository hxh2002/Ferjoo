// 后台权限与展示口径。页面只消费这里的判断和文案，真正的拒绝发生在数据库函数与 RLS。

export const DEVICE_ONLINE_MS = 40 * 60 * 1000;
export const ADMIN_PAGE_SIZE = 20;

const CLOSURE_DETAILS = {
  fallen: '峰值后回落',
  no_peak: '未见明显峰值',
  abnormal: '中途异常',
  record_only: '手动结束记录'
};

export function isAdminProfile(profile) {
  return profile?.role === 'A';
}

export function isSuperAdminProfile(profile) {
  return isAdminProfile(profile) && profile?.is_super_admin === true;
}

export function roleLabel(profile) {
  if (isSuperAdminProfile(profile)) return '首位管理员';
  if (profile?.role === 'A') return '管理员';
  return '用户';
}

export function personLabel(profile) {
  if (!profile) return '未知账号';
  return profile.display_name || profile.system_user_id || profile.email || '未知账号';
}

export function memberRoleLabel(role) {
  return role === 'owner' ? '所有者' : '成员';
}

export function canChangeRole(actor, target) {
  if (!isSuperAdminProfile(actor) || !target?.id) return false;
  if (actor.id === target.id) return false;
  if (target.is_super_admin) return false;
  return target.role === 'A' || target.role === 'U';
}

export function devicePresence(lastSeenAt, now = Date.now()) {
  const seen = Date.parse(lastSeenAt || '');
  if (!Number.isFinite(seen)) return 'never';
  return now - seen > DEVICE_ONLINE_MS ? 'offline' : 'online';
}

export const PRESENCE_LABEL = { online: '已连接', offline: '离线', never: '从未同步' };

export function roundStatus(row) {
  if (row?.ended_at) {
    return { key: 'closed', label: '已结束', source: row.reason === 'auto' ? '自动结束' : '手动结束' };
  }
  if (row?.next_feeding_at) return { key: 'closed', label: '已结束', source: '下一次喂养' };
  return { key: 'active', label: '进行中', source: '' };
}

export function closureDetailLabel(detail) {
  return CLOSURE_DETAILS[detail] || '';
}

export function formatRatio(ratio) {
  if (!ratio) return '未记录';
  if (ratio === 'deep_reset') return '大比例刷新';
  return ratio;
}

export function formatAdminTime(value) {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return '—';
  return new Date(time).toLocaleString('zh-CN', { hour12: false });
}

export function ilikeTerm(value) {
  return String(value || '').trim().replace(/[%_,.()"'\\]/g, '').slice(0, 80);
}

export function adminErrorMessage(error) {
  const message = String(error?.message || '');
  const code = error?.code || '';
  if (code === 'PGRST301' || code === 'PGRST303' || /JWT|token.*expired|AUTH_REQUIRED/i.test(message)) {
    return '登录已过期，请重新登录。';
  }
  if (
    code === 'PGRST202'
    || code === '42883'
    || code === '42703'
    || code === 'PGRST204'
    || /Could not find the function|admin_overview|admin_list_rounds|admin_get_round|admin_set_role|admin_create_account|is_super_admin/i.test(message)
  ) {
    return '后台接口尚未就绪。请先应用数据库迁移 033_admin_console.sql。';
  }
  if (message.includes('CANNOT_CHANGE_SELF')) return '不能修改自己的权限。';
  if (message.includes('CANNOT_CHANGE_SUPER_ADMIN')) return '不能修改首位管理员的权限。';
  if (message.includes('FORBIDDEN') || code === '42501' || /permission denied|row-level security/i.test(message)) {
    return '当前账号没有执行这个操作的权限。';
  }
  if (message.includes('EMAIL_TAKEN') || /already registered|duplicate key value/i.test(message)) return '这个邮箱已经注册。';
  if (message.includes('INVALID_EMAIL')) return '请填写有效的邮箱。';
  if (message.includes('INVALID_PASSWORD')) return '初始密码至少 6 位，且不超过 72 位。';
  if (message.includes('INVALID_NAME')) return '用户名不超过 80 个字。';
  if (message.includes('NOT_FOUND')) return '这条记录不存在。';
  if (/permission denied for (table|schema) auth/i.test(message)) {
    return '创建账号失败：当前数据库角色不能写入 Auth。请用数据库管理员应用迁移后再试。';
  }
  return '操作失败，请稍后重试。';
}
