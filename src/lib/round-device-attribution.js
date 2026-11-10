// 设置页的 starter_device_links 表示设备可用范围；传感器数据由喂养轮次实际归属。
// 轮次边界统一为 [喂养时间, min(下一次同酵种喂养, 手动结束, 当前时间))。
// 同一台设备被多个酵种关联时，后续喂养接管其起始时刻之后的数据，历史轮次保持不变。
const time = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value == null || value === '') return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export function roundBoundary({ feeding, nextFeedingAt, windowEndedAt, now = Date.now() } = {}) {
  const from = time(feeding?.occurred_at);
  const current = time(now);
  const next = time(nextFeedingAt);
  const closed = time(windowEndedAt);
  const end = Math.min(
    Number.isFinite(next) && next >= from ? next : Infinity,
    Number.isFinite(closed) && closed >= from ? closed : Infinity,
    Number.isFinite(current) ? current : Infinity
  );
  return { from, to: end, closed: Number.isFinite(end) && (end === next || end === closed) };
}

/** 任一酵种的后续有效喂养接管该设备，不影响其他设备的历史归属。 */
export function nextDeviceFeeding(feedings = [], { feeding, deviceId, links = [] } = {}) {
  const starterId = feeding?.starter_id;
  const from = time(feeding?.occurred_at);
  if (!starterId || !deviceId || !Number.isFinite(from)) return NaN;
  return feedings
    .filter((row) => row?.kind === 'feeding' && row.id !== feeding.id && time(row.occurred_at) > from)
    .filter((row) => links.some((link) => link.starter_id === row.starter_id && link.device_id === deviceId
      && time(link.active_from) <= time(row.occurred_at)
      && (link.active_to == null || time(link.active_to) > time(row.occurred_at))))
    .map((row) => time(row.occurred_at))
    .sort((a, b) => a - b)[0] ?? NaN;
}

/**
 * 把关联窗口裁剪成某酵种本轮的传感器归属窗口。
 * 没传轮次集合时无法证明共享设备上的排他归属，故返回空窗口；有明确设备ID的快照看轮次才读取。
 */
export function roundDeviceWindows(links = [], { feeding, feedings = [], nextFeedingAt, windowEndedAt, now = Date.now() } = {}) {
  const starterId = feeding?.starter_id;
  const round = roundBoundary({ feeding, nextFeedingAt, windowEndedAt, now });
  if (!starterId || !Number.isFinite(round.from)) return [];
  return links.flatMap((link) => {
    if (link.starter_id !== starterId || !link.device_id) return [];
    const from = Math.max(round.from, time(link.active_from));
    const handover = nextDeviceFeeding(feedings, { feeding, deviceId: link.device_id, links });
    // 没有后续接管时 handover 为 NaN，必须按 Infinity 参与比较，否则整个窗口会被丢弃。
    const to = Math.min(round.to, link.active_to == null ? Infinity : time(link.active_to), Number.isFinite(handover) ? handover : Infinity);
    if (!Number.isFinite(from) || !(to > from)) return [];
    return [{ ...link, from, to, deviceId: String(link.device_id), starterId }];
  }).sort((a, b) => a.from - b.from || a.deviceId.localeCompare(b.deviceId));
}

/** 某酵种各轮次实际拥有的设备窗口；closures 可以是数组或按 feeding_id 索引的 Map。 */
export function starterRoundDeviceWindows(links = [], { starterId, feedings = [], closures = [], now = Date.now() } = {}) {
  const rounds = feedings
    .filter((row) => row?.kind === 'feeding' && row.starter_id === starterId)
    .sort((a, b) => time(a.occurred_at) - time(b.occurred_at));
  const endedAt = (id) => closures instanceof Map ? closures.get(id)?.ended_at : closures.find((row) => row.feeding_id === id)?.ended_at;
  return rounds.flatMap((feeding, index) => roundDeviceWindows(links, {
    feeding, feedings, nextFeedingAt: rounds[index + 1]?.occurred_at,
    windowEndedAt: endedAt(feeding.id), now
  }));
}
