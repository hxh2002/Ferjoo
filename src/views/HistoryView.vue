<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useAuth } from '../composables/useAuth.js';
import SeriesChart from '../components/SeriesChart.vue';
import HistoryCalendar from '../components/HistoryCalendar.vue';
import WeekLanes from '../components/WeekLanes.vue';
import {
  addMeasurement,
  bindDeviceMember,
  claimDevice,
  getLatestMeasurement,
  listDeviceMembers,
  listDevices,
  listMeasurementsRange,
  renameDevice,
  unbindDeviceMember
} from '../services/device.service.js';

const ONLINE_WINDOW_MS = 20 * 60 * 1000; // 两个 10 分钟桶内视为在线
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_PAD_DAYS = 7;      // 月历数据前后多取 7 天，覆盖周视图跨月列
const FER_GAP_MS = 40 * 60 * 1000; // 发酵采样间隔超过 40 分钟即视为窗口断开
const MIN_SEG_POINTS = 2;      // 至少 2 个有效发酵点才构成诊断窗口
const POLL_MS = 60 * 1000;     // 新数据轮询间隔
const WIN_STORE_KEY = 'dr-ferjoo:history-windows';

const auth = useAuth();
const devices = ref([]);
const selectedId = ref('');
const latest = ref(null);
const error = ref('');
const busy = ref(false);
const measurement = reactive({
  temperatureC: '',
  heightMm: '',
  heightDeltaMm: '',
  humidityPercent: '',
  batteryPercent: ''
});

const selectedDevice = computed(() => devices.value.find((x) => x.device_id === selectedId.value));
const members = ref([]);
const memberSystemUserId = ref('');

const renaming = ref(false);
const renameValue = ref('');

const bindCode = ref('');
const bindSuccess = ref('');
const bindCopied = ref(false);

/* ---------- 三级时间分辨率 ---------- */
const calendarMonth = ref(monthStartOf(Date.now()));
const selectedDateKey = ref(dateKey(new Date()));
const records = ref([]);       // 已加载范围内全部数据（十分钟桶，升序）
const loadedFrom = ref(0);
const loadedTo = ref(0);
const manualWindows = ref([]); // 用户新建的窗口 [{ id, start, end }]
const editedWindows = ref({}); // 用户拖改过的自动窗口 { [segStart]: { id, start, end } }
const activeWindowId = ref('');
const createMode = ref(false);
const pendingStart = ref(null);

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthStartOf(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function monthEndOf(monthMs) {
  const d = new Date(monthMs);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1;
}
function dayMsOf(key) {
  const [y, m, dd] = key.split('-').map(Number);
  return new Date(y, m - 1, dd).getTime();
}
function iso(ms) {
  return new Date(ms).toISOString();
}

/* ---------- 分辨率 1：月份总览 ---------- */
// 绿=有有效发酵数据，红=只有休眠（或故障）数据，灰=无数据
const dayStats = computed(() => {
  const stats = {};
  for (const r of records.value) {
    const k = dateKey(new Date(rowTime(r)));
    if (r.mode === 'fer' && !r.sensor_error) stats[k] = 'fer';
    else if (stats[k] !== 'fer') stats[k] = 'sleep';
  }
  return stats;
});

function selectDate(key) {
  selectedDateKey.value = key;
  const m = monthStartOf(dayMsOf(key));
  if (m !== calendarMonth.value) {
    calendarMonth.value = m;
    refreshTimeline({ reset: true });
  }
}

function changeMonth(delta) {
  if (delta === 0) {
    const now = Date.now();
    calendarMonth.value = monthStartOf(now);
    selectedDateKey.value = dateKey(new Date(now));
  } else {
    const d = new Date(calendarMonth.value);
    calendarMonth.value = new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
  }
  refreshTimeline({ reset: true });
}

/* ---------- 分辨率 2：七日时间带 + 诊断窗口 ---------- */
const selectedDayMs = computed(() => dayMsOf(selectedDateKey.value));
const CN_WEEK = '日一二三四五六';
const weekDays = computed(() => {
  const center = selectedDayMs.value;
  const today = dateKey(new Date());
  const out = [];
  // 选中日期固定在第 3 列：前 2 天回看 + 后 4 天前瞻
  for (let off = -2; off <= 4; off += 1) {
    const d = new Date(center + off * DAY_MS);
    const key = dateKey(d);
    out.push({
      key,
      dayMs: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      sub: key === today ? '今天' : `周${CN_WEEK[d.getDay()]}`
    });
  }
  return out;
});

const rowTimeCache = new WeakMap();
function rowTime(r) {
  let t = rowTimeCache.get(r);
  if (t == null) {
    t = new Date(r.recorded_at).getTime();
    rowTimeCache.set(r, t);
  }
  return t;
}

const weekRecords = computed(() => {
  const start = weekDays.value[0]?.dayMs ?? 0;
  const end = start + 7 * DAY_MS;
  return records.value.filter((r) => {
    const t = rowTime(r);
    return t >= start && t < end;
  });
});

// 自动识别：连续「发酵且传感器正常」的采样段 => 诊断窗口
// 未被拖改过的自动窗口 follow=真实数据末尾，随新数据自动延展。
// 为降低开销，仅扫描当前周视图 ±1 天缓冲；外部窗口由手动/编辑保留。
const WINDOWS_SCAN_PAD = DAY_MS;
const windows = computed(() => {
  if (!weekDays.value.length) return [];
  const wStart = weekDays.value[0].dayMs - WINDOWS_SCAN_PAD;
  const wEnd = wStart + 7 * DAY_MS + 2 * WINDOWS_SCAN_PAD;
  const segList = [];
  let seg = null;
  for (const r of records.value) {
    const t = rowTime(r);
    if (t < wStart) continue;
    if (t >= wEnd) break;
    if (r.mode === 'fer' && !r.sensor_error) {
      if (seg && t - seg.end <= FER_GAP_MS) { seg.end = t; seg.points += 1; }
      else {
        if (seg && seg.points >= MIN_SEG_POINTS) segList.push(seg);
        seg = { start: t, end: t, points: 1 };
      }
    }
  }
  if (seg && seg.points >= MIN_SEG_POINTS) segList.push(seg);

  const out = [];
  for (const s of segList) {
    const edited = editedWindows.value[s.start];
    if (edited) out.push({ ...edited, kind: 'edited', follow: false, origin: s.start });
    else out.push({ id: `auto:${s.start}`, start: s.start, end: s.end, kind: 'auto', follow: true, origin: s.start });
  }
  for (const w of manualWindows.value) {
    if (w.end > wStart && w.start < wEnd) out.push({ ...w, kind: 'manual', follow: false });
  }
  return out.sort((a, b) => a.start - b.start);
});

const activeWindow = computed(() => windows.value.find((w) => w.id === activeWindowId.value) || null);

// 默认选中：当前周视图内结束最新的窗口
watch([windows, selectedDateKey], () => {
  if (windows.value.some((w) => w.id === activeWindowId.value)) return;
  const start = selectedDayMs.value - 2 * DAY_MS;
  const end = selectedDayMs.value + 5 * DAY_MS;
  const pool = windows.value.filter((w) => w.end > start && w.start < end);
  const pick = (pool.length ? pool : windows.value).reduce((best, w) => (best && best.end >= w.end ? best : w), null);
  activeWindowId.value = pick?.id || '';
});

function onLaneClick(ms) {
  if (!createMode.value) return;
  if (pendingStart.value == null) { pendingStart.value = ms; return; }
  const start = Math.min(pendingStart.value, ms);
  const end = Math.max(pendingStart.value, ms);
  if (end - start >= 10 * 60 * 1000) {
    const w = { id: `manual:${Date.now()}`, start, end };
    manualWindows.value = [...manualWindows.value, w];
    activeWindowId.value = w.id;
    persistWindows();
  }
  pendingStart.value = null;
  createMode.value = false;
}

function toggleCreate() {
  createMode.value = !createMode.value;
  pendingStart.value = null;
}

function onWindowDrag({ id, edge, ms }) {
  const w = windows.value.find((x) => x.id === id);
  if (!w) return;
  if (w.kind === 'auto') {
    editedWindows.value = {
      ...editedWindows.value,
      [w.origin]: { id: w.id, start: w.start, end: w.end, [edge]: ms }
    };
  } else if (w.kind === 'edited') {
    editedWindows.value = {
      ...editedWindows.value,
      [w.origin]: { ...editedWindows.value[w.origin], [edge]: ms }
    };
  } else {
    manualWindows.value = manualWindows.value.map((x) => (x.id === id ? { ...x, [edge]: ms } : x));
  }
  persistWindows();
}

function resetActiveWindow() {
  const w = activeWindow.value;
  if (!w || w.kind !== 'edited') return;
  const next = { ...editedWindows.value };
  delete next[w.origin];
  editedWindows.value = next;
  persistWindows();
}

function removeActiveWindow() {
  const w = activeWindow.value;
  if (!w || w.kind !== 'manual') return;
  manualWindows.value = manualWindows.value.filter((x) => x.id !== w.id);
  persistWindows();
}

// 手动/调整过的窗口按设备持久化（自动窗口每次从数据重新识别）
function persistWindows() {
  if (!selectedId.value) return;
  try {
    localStorage.setItem(`${WIN_STORE_KEY}:${selectedId.value}`, JSON.stringify({
      manual: manualWindows.value,
      edited: editedWindows.value
    }));
  } catch { /* 存储不可用时静默降级 */ }
}

function restoreWindows() {
  try {
    const raw = localStorage.getItem(`${WIN_STORE_KEY}:${selectedId.value}`);
    if (raw) {
      const { manual, edited } = JSON.parse(raw);
      manualWindows.value = (manual || []).filter((w) => Number.isFinite(w?.start) && Number.isFinite(w?.end) && w.end > w.start);
      editedWindows.value = edited && typeof edited === 'object' ? edited : {};
      return;
    }
  } catch { /* 忽略损坏的本地缓存 */ }
  manualWindows.value = [];
  editedWindows.value = {};
}

/* ---------- 分辨率 3：窗口详情 ---------- */
const windowRecords = computed(() => {
  const w = activeWindow.value;
  if (!w) return [];
  return records.value.filter((r) => {
    const t = rowTime(r);
    return t >= w.start && t <= w.end;
  });
});
const windowRowsDesc = computed(() => [...windowRecords.value].reverse());

// 手画/拖出的窗口可能超出已加载月份范围，按需补拉数据
watch(activeWindow, async (w) => {
  if (!w || !selectedId.value || !loadedTo.value) return;
  for (const [from, to] of [[w.start - 1, loadedFrom.value], [loadedTo.value, w.end + 1]]) {
    if (from >= to) continue;
    try {
      const rows = await listMeasurementsRange(selectedId.value, { from: iso(from), to: iso(to) });
      mergeRows(rows, from, to);
    } catch { /* 补拉失败不阻塞展示 */ }
  }
});

const tempSeries = computed(() => windowRecords.value.map((r) => ({ t: r.recorded_at, v: toNum(r.temperature_c), sensor_error: r.sensor_error })));
const heightSeries = computed(() => windowRecords.value.map((r) => ({ t: r.recorded_at, v: toNum(r.height_mm), sensor_error: r.sensor_error })));
const humiditySeries = computed(() => windowRecords.value.map((r) => ({ t: r.recorded_at, v: toNum(r.humidity_percent), sensor_error: r.sensor_error })));
const batterySeries = computed(() => windowRecords.value.map((r) => ({ t: r.recorded_at, v: toNum(r.battery_percent), sensor_error: r.sensor_error })));

const selectedStatus = computed(() => deviceStatus(selectedDevice.value));
const lastSeenText = computed(() => {
  const at = selectedDevice.value?.last_seen_at;
  if (!at) return '从未上报';
  return new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
});
const windowDurationText = computed(() => {
  const w = activeWindow.value;
  if (!w) return '';
  return fmtDuration(w.end - w.start);
});
const windowRangeText = computed(() => {
  const w = activeWindow.value;
  if (!w) return '';
  return `${fmtStamp(w.start)} → ${fmtStamp(w.end)}`;
});
const windowKindLabel = computed(() => ({ auto: '自动识别', edited: '已手动调整', manual: '手动创建' }[activeWindow.value?.kind] || ''));

function fmtStamp(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} 小时${m % 60 ? ` ${m % 60} 分` : ''}`;
  return `${Math.floor(h / 24)} 天${h % 24 ? ` ${h % 24} 小时` : ''}`;
}

/* ---------- 数据加载 / 轮询 ---------- */
// 按 10 分钟桶合并：同桶只保留最新一条（与 pickLatestPerBucket 同语义），
// 分页渐进合入不会在桶边界产生重复点。
const BUCKET_MS = 10 * 60 * 1000;
let loadToken = 0; // 单调递增；切换设备/月份后，旧请求的增量直接丢弃

function mergeRows(rows, from, to) {
  const map = new Map(records.value.map((r) => [Math.floor(rowTime(r) / BUCKET_MS), r]));
  for (const r of rows) {
    const k = Math.floor(rowTime(r) / BUCKET_MS);
    const prev = map.get(k);
    if (!prev || rowTime(prev) <= rowTime(r)) map.set(k, r);
  }
  records.value = [...map.values()].sort((a, b) => rowTime(a) - rowTime(b));
  loadedFrom.value = Math.min(loadedFrom.value || from, from);
  loadedTo.value = Math.max(loadedTo.value || to, to);
}

async function fetchRangeMerge(from, to, token) {
  if (from >= to) return;
  await listMeasurementsRange(selectedId.value, {
    from: iso(from),
    to: iso(to),
    onPage: (rows) => { if (token === loadToken) mergeRows(rows, from, to); }
  });
}

// 分级加载 + 渐进渲染：
// 阶段一只拉当前周视图 ±1 天（通常一页内），WEEK STRIP 立即出柱；
// 阶段二后台补齐月历需要的整月其余部分。每页合入即触发依赖重算。
async function refreshTimeline({ reset = false } = {}) {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  const token = ++loadToken;
  const monthFrom = calendarMonth.value - MONTH_PAD_DAYS * DAY_MS;
  const monthTo = Math.min(monthEndOf(calendarMonth.value) + MONTH_PAD_DAYS * DAY_MS, Date.now());
  let weekFrom = Math.max(selectedDayMs.value - 3 * DAY_MS, monthFrom);
  let weekTo = Math.min(selectedDayMs.value + 6 * DAY_MS, monthTo);
  if (weekFrom >= weekTo) { weekFrom = monthFrom; weekTo = monthTo; } // 选中日不在当前月：退回整月单段
  if (reset) {
    records.value = [];
    loadedFrom.value = 0;
    loadedTo.value = 0;
  }
  try {
    await fetchRangeMerge(weekFrom, weekTo, token);
  } catch (e) {
    if (token === loadToken) error.value = e?.message || '无法读取测量历史。';
  } finally {
    if (token === loadToken) busy.value = false;
  }
  // 阶段二不阻塞首屏；补拉失败静默（月历保持局部显示）
  Promise.all([
    fetchRangeMerge(monthFrom, weekFrom, token),
    fetchRangeMerge(weekTo, monthTo, token)
  ]).catch(() => {});
}

// 轮询新数据：让「跟随最新」的窗口末端随上报持续延展
async function pollLatest() {
  if (!selectedId.value || busy.value) return;
  try {
    const now = Date.now();
    const from = Math.max(loadedFrom.value || 0, now - 2 * DAY_MS, (loadedTo.value || 0) - FER_GAP_MS);
    if (from > now) return;
    const rows = await listMeasurementsRange(selectedId.value, { from: iso(from), to: iso(now) });
    if (rows.length) mergeRows(rows, from, now);
    latest.value = await getLatestMeasurement(selectedId.value);
  } catch { /* 静默：下个周期重试 */ }
}

let pollTimer = null;
function onKeydown(e) {
  if (e.key === 'Escape') { createMode.value = false; pendingStart.value = null; }
}

onMounted(async () => {
  await auth.init();
  if (auth.configured) await refreshDevices();
  pollTimer = setInterval(pollLatest, POLL_MS);
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  clearInterval(pollTimer);
  window.removeEventListener('keydown', onKeydown);
});

watch(selectedId, async (id) => {
  renaming.value = false;
  createMode.value = false;
  pendingStart.value = null;
  activeWindowId.value = '';
  records.value = [];
  loadedFrom.value = 0;
  loadedTo.value = 0;
  manualWindows.value = [];
  editedWindows.value = {};
  if (id) {
    restoreWindows();
    const now = Date.now();
    calendarMonth.value = monthStartOf(now);
    selectedDateKey.value = dateKey(new Date(now));
    await Promise.all([refreshTimeline({ reset: true }), refreshMembers(), refreshLatest()]);
  } else {
    members.value = [];
    latest.value = null;
  }
});

function toNum(value) {
  if (value == null || value === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function deviceStatus(device) {
  if (!device?.last_seen_at) return 'never';
  return Date.now() - new Date(device.last_seen_at).getTime() <= ONLINE_WINDOW_MS ? 'online' : 'offline';
}

const STATUS_LABEL = { online: '在线', offline: '离线', never: '未连接' };
const MODE_LABEL = { sleep: '休眠', fer: '发酵' };

async function refreshDevices() {
  busy.value = true; error.value = '';
  try {
    devices.value = await listDevices();
    if (!selectedId.value && devices.value.length) selectedId.value = devices.value[0].device_id;
    if (selectedId.value && !devices.value.some((d) => d.device_id === selectedId.value)) {
      selectedId.value = devices.value[0]?.device_id || '';
    }
  } catch (e) {
    error.value = e?.message || '无法读取设备。';
  } finally {
    busy.value = false;
  }
}

function startRename() {
  if (!selectedDevice.value) return;
  renameValue.value = selectedDevice.value.name || '';
  renaming.value = true;
}

async function saveRename() {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    await renameDevice(selectedId.value, renameValue.value);
    renaming.value = false;
    await refreshDevices();
  } catch (e) {
    error.value = e?.message || '重命名失败（需要设备创建者或管理员权限）。';
  } finally {
    busy.value = false;
  }
}

async function refreshLatest() {
  if (!selectedId.value) return;
  try {
    latest.value = await getLatestMeasurement(selectedId.value);
  } catch {
    latest.value = null;
  }
}

async function refreshMembers() {
  if (!selectedId.value) return;
  try {
    members.value = await listDeviceMembers(selectedId.value);
  } catch (e) {
    error.value = e?.message || '无法读取设备绑定。';
  }
}

async function bindMember() {
  if (!selectedId.value || !memberSystemUserId.value.trim()) return;
  busy.value = true; error.value = '';
  try {
    await bindDeviceMember(selectedId.value, memberSystemUserId.value);
    memberSystemUserId.value = '';
    await refreshMembers();
  } catch (e) {
    error.value = e?.message || '绑定用户失败。';
  } finally {
    busy.value = false;
  }
}

async function unbindMember(systemUserId) {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    await unbindDeviceMember(selectedId.value, systemUserId);
    await refreshMembers();
  } catch (e) {
    error.value = e?.message || '解绑用户失败。';
  } finally {
    busy.value = false;
  }
}

async function saveMeasurement() {
  if (!selectedId.value) return;
  busy.value = true; error.value = '';
  try {
    await addMeasurement(selectedId.value, measurement);
    Object.assign(measurement, { temperatureC: '', heightMm: '', heightDeltaMm: '', humidityPercent: '', batteryPercent: '' });
    await Promise.all([refreshTimeline(), refreshLatest()]);
  } catch (e) {
    error.value = e?.message || '保存测量失败。';
  } finally {
    busy.value = false;
  }
}

function fmt(value, suffix = '') {
  return value == null ? '—' : `${value}${suffix}`;
}

const canManage = computed(() => {
  if (auth.profile.value?.role === 'A') return true;
  const myId = auth.profile.value?.system_user_id;
  return members.value.some((m) => m.member_role === 'owner' && m.system_user_id === myId);
});

function formatBindCode(code) {
  if (!code) return '—';
  const clean = code.toUpperCase();
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

async function claimBind() {
  const code = bindCode.value.trim();
  if (!code) return;
  busy.value = true;
  error.value = '';
  bindSuccess.value = '';
  try {
    const res = await claimDevice(code);
    bindCode.value = '';
    await refreshDevices();
    if (res.device_id) selectedId.value = res.device_id;
    bindSuccess.value = res.already_mine
      ? '该设备已在你的列表中。'
      : res.role === 'owner'
        ? '绑定成功，你是这台设备的创建者。'
        : '绑定成功，设备已加入你的列表。';
    setTimeout(() => { bindSuccess.value = ''; }, 4000);
  } catch (e) {
    error.value = e?.message?.includes('INVALID_BIND_CODE')
      ? '绑定码无效，请核对后重试。'
      : e?.message || '绑定失败，请稍后重试。';
  } finally {
    busy.value = false;
  }
}

async function copyBindCode() {
  const code = selectedDevice.value?.bind_code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(formatBindCode(code));
    bindCopied.value = true;
    setTimeout(() => { bindCopied.value = false; }, 1500);
  } catch {
    bindCopied.value = false;
  }
}
</script>

<template>
  <section class="history-page">
    <div class="history-heading">
      <div>
        <p class="eyebrow">FERMENTATION HISTORY</p>
        <h1>数据看板</h1>
      </div>
      <div class="profile-plate">
        <small>FERJOO ID</small>
        <strong>{{ auth.profile.value?.system_user_id || '—' }}</strong>
        <span>{{ auth.profile.value?.display_name || auth.user.value?.email }}</span>
      </div>
    </div>

    <div v-if="!auth.configured" class="panel config-warning history-warning">
      Supabase 尚未配置，因此设备历史不可用。请先复制 .env.example 为 .env 并填写项目配置。
    </div>

    <template v-else>
      <p v-if="error" class="form-error global-error">{{ error }}</p>
      <div class="history-grid">
        <aside class="panel device-panel">
          <div class="panel-heading compact-heading">
            <div><p class="eyebrow dark">DEVICES</p><h2>我的设备</h2></div>
          </div>
          <form class="device-add bind-form" @submit.prevent="claimBind">
            <input
              v-model="bindCode"
              placeholder="输入设备绑定码"
              maxlength="12"
              autocomplete="off"
            />
            <button :disabled="busy" title="绑定设备">⇢</button>
          </form>
          <p v-if="bindSuccess" class="form-success bind-success">{{ bindSuccess }}</p>
          <div class="device-list">
            <button
              v-for="device in devices"
              :key="device.device_id"
              :class="{ selected: selectedId === device.device_id }"
              @click="selectedId = device.device_id"
            >
              <span class="device-dot" :class="`status-${deviceStatus(device)}`"></span>
              <span><strong>{{ device.name || device.device_id }}</strong><small>{{ device.device_id }}</small></span>
            </button>
            <p v-if="!devices.length" class="empty-list">还没有设备。输入设备标签上的绑定码即可认领设备。</p>
          </div>

          <div v-if="selectedDevice?.bind_code" class="bind-code-plate">
            <p class="eyebrow dark">BIND CODE</p>
            <div class="bind-code-row">
              <code>{{ formatBindCode(selectedDevice.bind_code) }}</code>
              <button class="copy-button" type="button" @click="copyBindCode">{{ bindCopied ? '已复制' : '复制' }}</button>
            </div>
            <small>家人或同事输入此码，即可把这台设备绑到自己的账号。</small>
          </div>

          <div v-if="selectedId && canManage" class="member-plate">
            <p class="eyebrow dark">DEVICE MEMBERS</p>
            <form class="device-add" @submit.prevent="bindMember">
              <input v-model="memberSystemUserId" placeholder="绑定用户 FERJOO ID" maxlength="9" />
              <button :disabled="busy">＋</button>
            </form>
            <small class="member-hint">输入对方的 FERJOO ID，即可共享这台设备的数据。</small>
            <div class="member-list">
              <div v-for="member in members" :key="member.system_user_id" class="member-row">
                <span class="member-avatar" aria-hidden="true">{{ (member.system_user_id || '?').charAt(0) }}</span>
                <span class="member-meta">
                  <strong class="member-id">{{ member.system_user_id }}</strong>
                  <small class="member-role" :class="{ owner: member.member_role === 'owner' }">{{ member.member_role === 'owner' ? '创建者' : '成员' }}</small>
                </span>
                <button v-if="member.member_role !== 'owner'" type="button" class="member-unbind" @click="unbindMember(member.system_user_id)">解绑</button>
              </div>
            </div>
          </div>
        </aside>

        <main class="panel measurement-panel">
          <div class="panel-heading compact-heading">
            <div>
              <p class="eyebrow dark">DATA OVERVIEW</p>
              <div v-if="!renaming" class="device-title-row">
                <h2>{{ selectedDevice?.name || '选择一个设备' }}</h2>
                <button
                  v-if="selectedDevice && canManage"
                  class="rename-button"
                  type="button"
                  title="重命名设备"
                  @click="startRename"
                >✎ 改名</button>
              </div>
              <form v-else class="rename-form" @submit.prevent="saveRename">
                <input v-model.trim="renameValue" maxlength="80" placeholder="设备名称" />
                <button class="small-primary" :disabled="busy">保存</button>
                <button class="ghost-button" type="button" @click="renaming = false">取消</button>
              </form>
            </div>
            <div v-if="selectedId" class="heading-side">
              <span class="status-pill" :class="`status-${selectedStatus}`">{{ STATUS_LABEL[selectedStatus] }}</span>
              <button class="copy-button" type="button" @click="refreshTimeline({ reset: true }); refreshLatest()">REFRESH</button>
            </div>
          </div>

          <div v-if="selectedId" class="meta-strip">
            <span class="meta-item"><small>模式</small>{{ MODE_LABEL[latest?.mode] || '—' }}</span>
            <span class="meta-item"><small>最后上报</small>{{ lastSeenText }}</span>
            <span v-if="latest?.sensor_error" class="meta-item warn"><small>传感器</small>故障</span>
          </div>

          <!-- 分辨率 1：月份总览 -->
          <div v-if="selectedId" class="timeline-block">
            <HistoryCalendar
              :month="calendarMonth"
              :stats="dayStats"
              :selected="selectedDateKey"
              @select="selectDate"
              @change-month="changeMonth"
            />
          </div>

          <!-- 分辨率 2：七日时间带 -->
          <div v-if="selectedId" class="timeline-block">
            <div class="strip-toolbar">
              <p class="eyebrow dark">WEEK STRIP · {{ weekDays[0]?.label }} – {{ weekDays[6]?.label }}</p>
              <button
                class="copy-button"
                :class="{ active: createMode }"
                type="button"
                title="在时间带上点击两点，创建自定义诊断窗口"
                @click="toggleCreate"
              >{{ createMode ? '取消创建' : '＋ 新建诊断窗口' }}</button>
            </div>
            <p v-if="createMode" class="create-tip">
              在时间带上点击设定窗口{{ pendingStart == null ? '【起点】' : '【终点】' }}，可按 Esc 取消。
            </p>
            <div class="week-scroll">
              <WeekLanes
                :days="weekDays"
                :records="weekRecords"
                :windows="windows"
                :active-window-id="activeWindowId"
                :selected-key="selectedDateKey"
                :create-mode="createMode"
                :pending-start="pendingStart"
                @lane-click="onLaneClick"
                @select-window="(id) => (activeWindowId = id)"
                @drag-window="onWindowDrag"
              />
            </div>
            <p class="strip-hint">系统会自动识别连续发酵段为诊断窗口；拖动窗口上下两边的横线可微调起止时间（5 分钟步进）。</p>
          </div>

          <!-- 分辨率 3：诊断窗口详情 -->
          <div v-if="selectedId" class="timeline-block">
            <div class="strip-toolbar">
              <p class="eyebrow dark">DIAGNOSTIC WINDOW</p>
              <div v-if="activeWindow" class="win-actions">
                <button v-if="activeWindow.kind === 'edited'" class="copy-button" type="button" @click="resetActiveWindow">重置为自动</button>
                <button v-if="activeWindow.kind === 'manual'" class="copy-button" type="button" @click="removeActiveWindow">删除窗口</button>
              </div>
            </div>

            <template v-if="activeWindow">
              <div class="win-info">
                <span class="win-range">{{ windowRangeText }}</span>
                <span class="win-badge">{{ windowDurationText }}</span>
                <span class="win-badge kind">{{ windowKindLabel }}</span>
                <span v-if="activeWindow.follow" class="win-badge live">● 随新数据延展</span>
                <span class="win-badge count">{{ windowRecords.length }} 个采样</span>
              </div>

              <div class="chart-grid">
                <SeriesChart class="chart-feature" label="高度" unit="mm" color="#2b7de8" :points="heightSeries" />
                <SeriesChart label="温度" unit="°C" color="#e85d16" :points="tempSeries" />
                <SeriesChart label="湿度" unit="%" color="#2b8a5e" :points="humiditySeries" />
                <SeriesChart label="电量" unit="%" color="#8a6d1f" :points="batterySeries" />
              </div>

              <form class="measurement-form" @submit.prevent="saveMeasurement">
                <label><span>温度 °C</span><input v-model="measurement.temperatureC" type="number" step="0.1" /></label>
                <label><span>高度 mm</span><input v-model="measurement.heightMm" type="number" step="0.1" /></label>
                <label><span>高度变化 mm</span><input v-model="measurement.heightDeltaMm" type="number" step="0.1" /></label>
                <label><span>湿度 %</span><input v-model="measurement.humidityPercent" type="number" step="0.1" /></label>
                <label><span>电量 %</span><input v-model="measurement.batteryPercent" type="number" step="0.1" /></label>
                <button class="small-primary" :disabled="busy">保存当前测量</button>
              </form>

              <div class="table-wrap">
                <table>
                  <thead><tr><th>时间</th><th>模式</th><th>温度</th><th>高度</th><th>Δ高度</th><th>湿度</th><th>电量</th><th>传感器</th></tr></thead>
                  <tbody>
                    <tr v-for="row in windowRowsDesc" :key="row.id">
                      <td>{{ new Date(row.recorded_at).toLocaleString() }}</td>
                      <td>{{ MODE_LABEL[row.mode] || '—' }}</td>
                      <td>{{ fmt(row.temperature_c, '°') }}</td>
                      <td>{{ fmt(row.height_mm, ' mm') }}</td>
                      <td>{{ fmt(row.height_delta_mm, ' mm') }}</td>
                      <td>{{ fmt(row.humidity_percent, '%') }}</td>
                      <td>{{ fmt(row.battery_percent, '%') }}</td>
                      <td :class="{ 'sensor-error-text': row.sensor_error }">{{ row.sensor_error ? '故障' : '正常' }}</td>
                    </tr>
                    <tr v-if="!windowRowsDesc.length"><td colspan="8" class="empty-table">该窗口内暂无测量记录。</td></tr>
                  </tbody>
                </table>
              </div>
            </template>
            <p v-else class="empty-windows">
              附近暂无有效发酵窗口。开始发酵后系统会自动识别连续发酵段；也可点击「＋ 新建诊断窗口」在时间带上手动圈选。
            </p>
          </div>
        </main>
      </div>
    </template>
  </section>
</template>
