export function localDateTimeValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('请填写完整有效的本地日期时间。');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || localDateTimeValue(date) !== value) {
    throw new Error('日期时间无效，或处于夏令时跳过的时段，请重新选择。');
  }
  // Date chooses the earlier instant when the local clock repeats at DST end.
  return date;
}
