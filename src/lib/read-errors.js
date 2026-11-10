// 读取历史数据时的错误分类：登录过期、没有权限、迁移未执行、数据本身为空是四种不同的情况，文案必须分开。
const MISSING_SCHEMA_CODES = ['42P01', 'PGRST205', 'PGRST202', '42883'];

export const READ_MESSAGES = {
  authExpired: '登录已过期，请重新登录后再查看历史数据。',
  denied: '你已不是这台设备的成员，且这段时间不在你的关联记录内，无法读取设备读数。请联系设备所有者重新共享。',
  deniedHistory: '你已不是这台设备的成员，历史读数暂时读取失败；请确认已执行最新数据库迁移，或联系设备所有者重新共享。',
  empty: '这段时间没有设备采样。',
  incomplete: '设备采样量过大，只读取到一部分，结果不完整。请缩短时间范围后重试。'
};

export const isMissingSchema = (error) => MISSING_SCHEMA_CODES.includes(error?.code);

/** JWT 过期 / 未登录：与「没有权限」区分，提示重新登录而不是怀疑共享关系。 */
export function isAuthExpired(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST301' || error?.code === 'PGRST303' || error?.status === 401
    || /JWT|token.*expired|expired.*token|AUTH_REQUIRED/i.test(message);
}

export function isPermissionDenied(error) {
  return !isAuthExpired(error) && (error?.code === '42501' || error?.status === 403 || /permission denied|row-level security/i.test(String(error?.message || '')));
}

/** @returns {'auth'|'denied'|'missing'|'other'} */
export function classifyReadError(error) {
  if (isAuthExpired(error)) return 'auth';
  if (isPermissionDenied(error)) return 'denied';
  if (isMissingSchema(error)) return 'missing';
  return 'other';
}

export function readErrorMessage(error, fallback = '读取失败，请稍后重试。') {
  const kind = classifyReadError(error);
  if (kind === 'auth') return READ_MESSAGES.authExpired;
  if (kind === 'denied') return READ_MESSAGES.denied;
  return error?.message || fallback;
}

/** 数据读取不完整（触顶分页上限）时抛出的错误：绝不静默截断。 */
export function incompleteReadError(rowCount) {
  const error = new Error(READ_MESSAGES.incomplete);
  error.code = 'MEASUREMENTS_INCOMPLETE';
  error.rowCount = rowCount;
  return error;
}
