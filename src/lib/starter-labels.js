// 同名酵种的辅助区分：只在列表里确有重名时才返回次要文案，名字唯一的行保持干净。
const pad = (value) => String(value).padStart(2, '0');

function createdLabel(value, withTime) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const day = `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  return `创建于 ${day}${withTime ? ` ${pad(date.getHours())}:${pad(date.getMinutes())}` : ''}`;
}

/**
 * @param {{ id: string, name?: string, created_at?: string, deviceId?: string }[]} rows
 * @returns {Map<string, string>} starter id → 次要说明（无重名时为空 Map）
 */
export function starterDisambiguation(rows) {
  const result = new Map();
  const groups = new Map();
  for (const row of rows || []) {
    const key = String(row?.name ?? '').trim();
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const dayLabels = group.map((row) => createdLabel(row.created_at, false));
    group.forEach((row, index) => {
      let label = dayLabels[index];
      // 同一天创建的重名酵种再补时分；没有创建时间时退回设备尾号，仍没有就用序号。
      if (label && dayLabels.filter((item) => item === label).length > 1) label = createdLabel(row.created_at, true);
      if (!label && row.deviceId) label = `设备 …${String(row.deviceId).slice(-4)}`;
      result.set(row.id, label || `同名酵种 ${index + 1}`);
    });
  }
  return result;
}
