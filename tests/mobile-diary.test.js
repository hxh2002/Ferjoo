import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { recentRecordDays, validLocalDay, recordDayRange, normalizeRecordsQuery, recordsDetailTarget, recordsDayModel, recordDeviceMetrics, roundState, createRecordsLoader, formalMeasurementDays, markReadRange } from '../src/lib/mobile-records.js';

const source = await readFile(new URL('../src/views/mobile/MobileDiary.vue', import.meta.url), 'utf8');
const trendSource = await readFile(new URL('../src/views/mobile/MobileTrend.vue', import.meta.url), 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
compileScript(descriptor, { id: 'records-test' });
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'MobileDiary.vue', id: 'records-test' }).errors, []);
const tokens = await readFile(new URL('../src/assets/tokens.css', import.meta.url), 'utf8');
const mainCss = await readFile(new URL('../src/assets/main.css', import.meta.url), 'utf8');
const mobileCss = await readFile(new URL('../src/assets/mobile.css', import.meta.url), 'utf8');
assert.match(tokens, /--radius-badge:\s*4px/);
for (const css of [mainCss, mobileCss, source, await readFile(new URL('../src/views/mobile/MobileDeviceHome.vue', import.meta.url), 'utf8'), trendSource]) {
  assert.doesNotMatch(css, /border-radius:\s*999px/i, 'pill radius must use shape tokens');
}
assert.match(source, /\.date-cell\{[^}]*border-radius:var\(--radius-control\)/);
assert.match(source, /\.date-grid-shared \.date-cell\{[^}]*min-height:0;height:36px/);
assert.doesNotMatch(source, /\.date-cell\{[^}]*border-radius:\s*\d+%/);
assert.match(source, /recentRecordDays\(\)/);
assert.match(source, /展开日历/);
assert.match(source, /class="month-row"[\s\S]*class="date-calendar"/);
assert.match(source, /class="date-grid date-grid-shared"[\s\S]*v-for="item in dateCells"/);
assert.match(source, /:key="item\.value" :data-date="item\.value"/);
assert.match(source, /const firstRects = new Map[\s\S]*first\.left - last\.left[\s\S]*first\.top - last\.top/);
assert.match(source, /cell\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/);
assert.match(source, /grid-template-rows:82px/);
assert.match(source, /height:82px/);
assert.match(source, /shiftWeek/);
assert.match(source, /aria-label="选择年月"/);
assert.match(source, /MWheelPicker/);
assert.doesNotMatch(source, /week-rows|weekLabel|compactWeek|blank-|repeat\(6,34px\)|auto-fit/);
assert.match(source, /weekday-row weekday-row-shared[\s\S]*v-for="item in weekdayColumns"[\s\S]*class="date-grid date-grid-shared"/);
assert.match(source, /weekdayRects = new Map[\s\S]*weekdayRow\.children[\s\S]*duration: 360, easing/);
assert.doesNotMatch(source, /<small>\{\{ item\.weekday \}\}<\/small>/);
assert.match(source, /prefers-reduced-motion: reduce/);
assert.match(source, /selectStarter/);
assert.doesNotMatch(source, /全部酵种|所有酵种|m-filters|类型筛选|对象<select|legend=/);
// 日记标题留在页首；酵种医生跟着当天摘要，并沿用选中酵种进入轮次选择。
assert.match(source, /class="diary-head"[\s\S]*<h1>日记<\/h1>/);
assert.match(source, /class="doctor-link"[\s\S]*path: '\/doctor\/rounds'/);
assert.match(source, /selectedStarterId \? \{ starter: selectedStarterId \}/);
assert.match(source, /酵种医生/);
assert.match(source, /\.diary-head\{[^}]*min-height:36px/);
assert.match(source, /当天喂养/);
// 观察/诊断页头部与步骤条。
const checkinSource = await readFile(new URL('../src/views/mobile/MobileCheckin.vue', import.meta.url), 'utf8');
assert.match(checkinSource, /class="checkin-head"[\s\S]*class="observe-index"/);
assert.match(checkinSource, /class="step-track"[\s\S]*stepMeta\.total/);
assert.match(checkinSource, /\.step-track li\.active \.step-dot\s*\{\s*background:\s*var\(--brand-action\)/);
assert.match(checkinSource, /checkin-starter/);
// 一级页面不再逐台列出设备：只留一个「本日全部数据 ›」胶囊入口，曲线下放到各轮次，采样明细走设备二级页。
assert.match(source, /deviceBlocks/);
assert.match(source, /本日全部数据 ›/);
assert.doesNotMatch(source, />单日数据</);
assert.doesNotMatch(source, /本日设备数据|在线 \{\{ item\.online \}\}|\{\{ item\.count \}\} 条采样|device-row|chart-group/, 'the old per-device rows are gone');
assert.match(source, /<RouterLink class="day-data-pill" :to="dayDataBlock\.to">/);
assert.match(source, /const dayDataBlock = computed\(\(\) => deviceBlocks\.value\.reduce\(\(best, item\) => \(!best \|\| item\.count > best\.count \? item : best\), null\)\)/, 'multiple devices link to the one with the most samples');
assert.match(source, /<small v-if="dayDataPartial" class="day-data-note">部分采样未完整加载/);
assert.match(source, /\.day-data-pill\{[^}]*border-radius:var\(--radius-pill\);background:var\(--m-disc\);color:var\(--m-text-link\)/, 'pill uses existing tokens only');
assert.doesNotMatch(source.match(/\.day-data-pill\{[^}]*\}/)[0], /#[0-9a-f]{3,8}/i);
// 年月白卡：滚轮渐隐用卡片底色；「完成」在文档流里并压在渐隐之上，不再绝对定位到滚轮底部。
assert.match(source, /\.month-wheels\{--m-wheel-fade-bg:var\(--surface-card\);[^}]*isolation:isolate/);
assert.match(source, /\.month-wheel-done\{position:relative;z-index:3;grid-column:1 \/ -1;justify-self:end/);
assert.match(await readFile(new URL('../src/components/mobile/MWheelPicker.vue', import.meta.url), 'utf8'), /\.m-wheel-fade-top \{[^}]*var\(--m-wheel-fade-bg, var\(--surface-page\)\)/);
assert.match(source, /最高膨胀率/);
assert.match(source, /平均温度/);
assert.match(source, /平均湿度/);
// 轮次卡片是当天的主线，「本日全部数据」胶囊排在卡片之后、观察记录之前。
assert.ok(source.indexOf('record-group round-group') < source.indexOf('record-group day-data-group'), 'rounds appear above the day-data pill');
assert.ok(source.indexOf('record-group day-data-group') < source.indexOf('record-group observation-group'), 'the pill stays where the old group sat');
assert.match(source, /class="feed-card"/);
assert.match(source, /metrics: roundMetrics\(item\)/);
// 结束时间留在独立字段，标题和链接都不能误用路由对象 to。
assert.match(source, /toLabel: closed \? range\.to : '现在'/);
assert.match(source, /:to="item\.to"/);
assert.doesNotMatch(source, /\{\{ item\.to \}\}/);
assert.doesNotMatch(source, /to: closed \? range\.to : '现在'/);
// 跨日不再用 +/- 天圆标：轮次标题直接补日期前缀（startedLabel），一级卡片只回答「几点到几点」。
assert.match(source, /startedLabel: carried \? `\$\{new Date\(from\)\.getMonth\(\) \+ 1\} 月 \$\{new Date\(from\)\.getDate\(\)\} 日 \$\{range\.from\}`/);
assert.doesNotMatch(source, /dayOffsetText|fromOffset|toOffset|day-offset/);
assert.doesNotMatch(source, /chartGroups|windowBands|dayStartIso|dayEndIso/);
assert.match(source, /详情 ›/);
assert.doesNotMatch(source, /deviceItem|device-metrics/);
assert.match(trendSource, /设备状态/);
assert.match(trendSource, /deviceStatus/);
// 全天曲线属于设备二级页，一级记录页只留文字摘要。
assert.match(trendSource, /全天数据/);
// 采样明细默认折叠，用户点开才展开。
assert.match(trendSource, /<details class="table-details">[\s\S]*<summary class="chart-title">/);
assert.doesNotMatch(trendSource, /<details[^>]*\sopen[\s>]/);
assert.doesNotMatch(trendSource, /window-list/);
assert.deepEqual(roundState({ windowStatus: 'closed', windowEndReason: 'next_feeding' }), { label: '已结束', tone: 'closed' });
assert.deepEqual(roundState({ windowStatus: 'closed', windowEndReason: 'manual' }), { label: '手动结束', tone: 'closed' });
assert.deepEqual(roundState({ windowStatus: 'in_progress', baselineStatus: 'pending' }), { label: '基线计算中', tone: 'pending' });
assert.deepEqual(roundState({ windowStatus: 'in_progress', dataQuality: 'stale' }), { label: '数据中断', tone: 'pending' });
assert.deepEqual(roundState({ windowStatus: 'in_progress', baselineStatus: 'established', dataQuality: 'complete' }), { label: '进行中', tone: 'active' });
// 离开记录页后 query 必然变化；读取与规范化都必须限定在本页，否则会把详情页或今日页顶回列表。
assert.match(source, /onRecordsPage/);
// 再次进入只有写入过数据才丢弃当日缓存，否则直接复用，避免每次进页都重新加载。
assert.match(source, /const changed = readRevision\(\) !== loadedRevision/);
assert.match(source, /if \(changed\) loader\.clear\(\)/);
assert.match(source, /const keep = !!model\.value && loadedPosition === position/);
const days = recentRecordDays(new Date(2026, 9, 22, 23, 45));
assert.equal(days.length, 14);
assert.equal(days[0], '2026-10-09');
assert.equal(days.at(-1), '2026-10-22');
assert.equal(validLocalDay('2026-10-22'), true);
assert.equal(validLocalDay('2026-02-30'), false);
const range = recordDayRange('2026-10-22');
assert.equal(new Date(range.from).getHours(), 0);
assert.equal(new Date(range.to).getDate(), 23);
assert.deepEqual(normalizeRecordsQuery({ starter: 'old', type: 'device', from: 'bad', to: 'bad', page: '1' }, new Date(2026, 9, 22)), { from: '2026-10-22', to: '2026-10-22', page: '1', starter: 'old' });
assert.deepEqual(normalizeRecordsQuery({ starter:'s1', type:'feeding', from:'2026-10-18', to:'2026-10-20', page:'2' }, new Date(2026,9,22)), { from:'2026-10-18', to:'2026-10-18', page:'2', starter:'s1' });
const returnTarget = recordsDetailTarget({ kind: 'device', device_id: 'dev/1', starter_id: 's1', day: days[0] }, '/diary?from=2026-10-09');
assert.equal(returnTarget.path, '/devices/dev%2F1/trend');
assert.equal(returnTarget.query.returnTo, '/diary?from=2026-10-09');
const feeding = { id: 'f1', kind: 'feeding', starter_id: 's1', occurred_at: '2026-10-22T09:00:00Z', ratio: '1:2:2', input: {} };
const next = { id: 'f2', kind: 'feeding', starter_id: 's1', occurred_at: '2026-10-22T15:00:00Z', input: {} };
const observation = { id: 'o1', kind: 'observation', starter_id: 's1', occurred_at: '2026-10-22T11:00:00Z' };
const model = recordsDayModel({ day: '2026-10-22', facts: [feeding, next, observation], context: { feedings: [feeding, next], closures: [{ feeding_id: 'f1', ended_at: '2026-10-22T13:00:00Z', reason: 'manual', detail: 'fallen' }], closuresComplete: true, notices: [] }, devices: { links: [], samples: [], summaries: [] } });
assert.equal(model.feedingCount, 2);
assert.equal(model.events.filter(row => row.kind === 'feeding').length, 2, 'each feeding is a distinct round anchor');
assert.equal(model.events.find(row => row.id === 'f1').summary.windowEndReason, 'manual');
assert.equal(model.events.find(row => row.id === 'f1').closure.detail, 'fallen');
assert.equal(model.events.find(row => row.id === 'f1').summary.measurementCount, 0, 'no device evidence does not erase feeding facts');
const linkedRound = recordsDayModel({
  day: '2026-10-22', facts: [feeding],
  context: { feedings: [feeding], closures: [], closuresComplete: true, notices: [] },
  devices: { links: [{ starter_id: 's1', device_id: 'd1', active_from: '2026-10-20T00:00:00Z', active_to: null }], samples: [], summaries: [] },
  now: Date.parse('2026-10-22T12:00:00Z')
}).events[0];
assert.equal(linkedRound.deviceId, 'd1');
assert.equal(linkedRound.linked, true);
const overnight = recordsDayModel({ day: '2026-10-22', facts: [], context: { feedings: [{ ...feeding, occurred_at: '2026-10-20T12:00:00Z' }], closures: [], closuresComplete: true, notices: [] }, devices: { links: [], samples: [], summaries: [] }, now: Date.parse('2026-10-22T01:00:00Z') });
assert.equal(overnight.continuations.length, 1, 'prior-day active round is a continuation, never a second main entry');
assert.equal(recordDeviceMetrics([]), '暂无有效指标，缺测/休眠/故障样本不作为数值结论');
const excluded = recordDeviceMetrics([{mode:'sleep',sensor_error:false,height_mm:20},{mode:'fer',sensor_error:true,height_mm:40}]);
assert.match(excluded, /暂无有效指标/);
let careCalls = 0;
const loader = createRecordsLoader({ listCareRecords: async ({ limit }) => { careCalls++; return limit ? [feeding] : []; } });
await loader.facts('u1', '2026-10-22', 1);
await loader.facts('u1', '2026-10-22', 1);
assert.equal(careCalls, 1, 'cached day facts avoid repeat reads');
loader.clear(); await loader.facts('u1', '2026-10-22', 1);
assert.equal(careCalls, 2, 'clearing invalidates fact cache');
const scopedStarterIds = [];
const scopedLoader = createRecordsLoader({ listCareRecords: async ({ starterId }) => { scopedStarterIds.push(starterId); return []; } });
await scopedLoader.facts('u1', '2026-10-22', 1, 's1');
await scopedLoader.facts('u1', '2026-10-22', 1, 's2');
assert.deepEqual(scopedStarterIds, ['s1', 's2'], 'a page reads one starter at a time and never reuses another jar cache');
const clock = new Date();
// 取前一完整日：当天刚过零点时不足十分钟，读取摘要会被合理跳过而误伤用例。
const deviceDay = recentRecordDays(clock).at(-2);
const dayStart = new Date(`${deviceDay}T00:00:00`);
const sampleAt = new Date(dayStart.getTime() + 3600000).toISOString();
const activeFrom = new Date(dayStart.getTime() - 86400000).toISOString();
const failingLoader = createRecordsLoader({
  listStarterDeviceLinks: async () => ['ok', 'broken'].map((id) => ({ starter_id: id, device_id: id, active_from: activeFrom, active_to: null })),
  mobileDeviceService: async () => ({ range: async (deviceId) => { if (deviceId === 'broken') throw new Error('offline'); return { complete:true, rows:[{id:'sample',device_id:deviceId,recorded_at:sampleAt,mode:'fer',sensor_error:false,height_mm:30}] }; } }),
  // 设备采样按喂养轮次归属：每个酵种在当天之前有一次喂养，轮次延续到当天。
  // 整天索引（无 from/to）返回全部喂养，让摘要与日历标记使用同一套轮次边界。
  listCareRecords: async ({ starterId, from, to }) => {
    const feed = (id) => ({ id: `feed-${id}`, starter_id: id, kind: 'feeding', occurred_at: activeFrom, input: {}, ratio: '1:2:2' });
    if (from && to) return starterId === 'ok' ? [feed('broken')] : [];
    if (starterId && to) return [feed(starterId)];
    return [feed('ok'), feed('broken')];
  },
  loadWindowClosures: async () => []
});
const partial = await failingLoader.devices('u1',deviceDay,['ok','broken']);
assert.equal(partial.summaries.length,1,'one device failure does not prevent the working linked device summary');
assert.ok(partial.notices.some(value => value.includes('设备数据读取失败')));
assert.equal(partial.samples[0].device_id,'ok','only linked device sample is used');

// 日记的设备摘要与日历采样标记同一口径：按全部历史轮次窗口读取，空窗期不读、也不混入别的酵种时段。
{
  const day = (d) => recordDayRange(d).from;
  const noon = new Date(`${'2026-10-21'}T12:00:00`).toISOString();
  const evening = new Date(`${'2026-10-21'}T18:00:00`).toISOString();
  const history = [
    { starter_id: 's1', device_id: 'd1', active_from: day('2026-10-19'), active_to: noon },
    { starter_id: 's1', device_id: 'd1', active_from: evening, active_to: null }
  ];
  const roundFeed = { id: 'f1', starter_id: 's1', kind: 'feeding', occurred_at: day('2026-10-18'), input: {}, ratio: '1:2:2' };
  const reads = [];
  const rowAt = (hour) => ({ device_id: 'd1', recorded_at: `2026-10-21T${String(hour).padStart(2, '0')}:00:00`, mode: 'fer', sensor_error: false });
  const loader = createRecordsLoader({
    // 关联按账号整体读取（与 marks 一致），因此不依赖 starterId 参数。
    listStarterDeviceLinks: async () => history,
    listCareRecords: async ({ kind }) => kind === 'feeding' ? [roundFeed] : [],
    loadWindowClosures: async () => [],
    mobileDeviceService: async () => ({ range: async (deviceId, range) => {
      reads.push({ deviceId, from: range.from, to: range.to, starterId: range.starterId });
      return { complete: true, rows: [rowAt(8), rowAt(15), rowAt(20)] };
    } })
  });
  const summary = await loader.devices('u1', '2026-10-21', ['s1']);
  assert.equal(reads.length, 2, 'one read per historical window instead of one read for the whole day');
  assert.deepEqual(reads.map((read) => [read.from, read.to]), [
    [day('2026-10-21'), noon],
    [evening, new Date(recordDayRange('2026-10-22').from).toISOString()]
  ], 'reads stop at each window edge; the unbound gap is never requested');
  assert.ok(reads.every((read) => read.starterId === 's1'), 'every read is scoped to the starter');
  const hours = summary.samples.map((row) => new Date(row.recorded_at).getHours()).sort((a, b) => a - b);
  assert.deepEqual(hours, [8, 20], 'the sample inside the unbound gap is not attributed to the starter');
  assert.equal(summary.summaries.length, 1, 'both windows share one daily device summary');
}

// 日期圆形背景只代表当前酵种关联时段内的正式采样，休眠、故障及其他设备不算。
assert.doesNotMatch(source, /cell-data-dot|name="date-mark"/);
assert.match(source, /\.date-view:not\(\.expanded\) \.date-grid-shared \.date-cell\.marked:not\(\.active\)\{background:var\(--m-icon-disc\)\}/);
assert.match(source, /\.date-view\.expanded \.date-cell\.marked:not\(\.active\) \.cell-day\{background:var\(--m-date-mark\)\}/);
assert.match(source, /\.date-view\.expanded \.date-cell\.active \.cell-day\{background:var\(--brand-light\);font-weight:500\}/, 'selected dates keep the stronger highlight');
assert.match(source, /\.date-cell\.today:not\(\.active\)\{font-weight:500\}/, 'today remains distinct from data marks');
assert.match(source, /watch\(\[accountId, selectedStarterId, visibleMarkRange\]/);
assert.match(source, /有正式数据/);
const formalRange = { from: recordDayRange('2026-10-19').from, to: recordDayRange('2026-10-22').from };
const formalLinks = [{ starter_id: 's1', device_id: 'd1', active_from: formalRange.from, active_to: recordDayRange('2026-10-21').from }];
const sampleOn = (day, hour, extra = {}) => ({ device_id: 'd1', recorded_at: `${day}T${String(hour).padStart(2, '0')}:00:00`, ...extra });
assert.deepEqual(formalMeasurementDays([
  sampleOn('2026-10-19', 8, { mode: 'sleep', sensor_error: false }),
  sampleOn('2026-10-20', 8, { mode: 'fer', sensor_error: false }),
  sampleOn('2026-10-20', 9, { mode: 'fer', sensor_error: true }),
  sampleOn('2026-10-21', 8, { mode: 'fer', sensor_error: false }),
  sampleOn('2026-10-20', 10, { device_id: 'other', mode: 'fer', sensor_error: false }),
  sampleOn('2026-10-23', 8, { mode: 'fer', sensor_error: false })
], formalLinks, formalRange), { '2026-10-20': true });
assert.equal(markReadRange('2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z'), null, 'future calendars do not request measurements');
const markCalls = [];
// 日历标记按喂养轮次归属设备采样：给 s1 一次早于可见范围的喂养，轮次延续到关联结束。
const markFeeding = { id: 'mark-feed', starter_id: 's1', kind: 'feeding', occurred_at: formalRange.from, input: {}, ratio: '1:2:2' };
const markCare = async ({ userId, kind, offset = 0 }) => { assert.equal(userId, 'u1'); assert.equal(kind, 'feeding'); return offset ? [] : [markFeeding]; };
const marksLoader = createRecordsLoader({
  listStarterDeviceLinks: async ({ userId }) => {
    assert.equal(userId, 'u1');
    return formalLinks;
  },
  listCareRecords: markCare,
  loadWindowClosures: async () => [],
  mobileDeviceService: async () => ({
    range: async (deviceId, range) => {
      markCalls.push({ deviceId, range });
      return { complete: true, rows: [
        sampleOn('2026-10-19', 8, { mode: 'sleep', sensor_error: false }),
        sampleOn('2026-10-20', 8, { mode: 'fer', sensor_error: false }),
        sampleOn('2026-10-20', 9, { mode: 'fer', sensor_error: true }),
        sampleOn('2026-10-21', 8, { mode: 'fer', sensor_error: false })
      ] };
    }
  })
});
const markRange = { from: formalRange.from, to: recordDayRange('2026-10-22').from };
assert.deepEqual(await marksLoader.marks('u1', markRange, 's1'), { '2026-10-20': true });
assert.deepEqual(markCalls, [{ deviceId: 'd1', range: { from: markRange.from, to: formalLinks[0].active_to, starterId: 's1' } }], 'measurement reads are clipped to visible dates and the device link, scoped to the starter');
await marksLoader.marks('u1', markRange, 's1');
assert.equal(markCalls.length, 1, 'identical visible ranges share the cached measurement marks');
marksLoader.clear();
await marksLoader.marks('u1', markRange, 's1');
assert.equal(markCalls.length, 2, 'new writes invalidate cached measurement marks');
// 重绑后的多段窗口：每段窗口各读一次，第二段（重绑后）的采样同样标记；空窗期与读取失败如实暴露。
{
  const day = (d) => recordDayRange(d).from;
  const windows = [
    { starter_id: 's1', device_id: 'd1', active_from: day('2026-10-19'), active_to: day('2026-10-20') },
    { starter_id: 's1', device_id: 'd1', active_from: day('2026-10-21'), active_to: null }
  ];
  const calls = [];
  const rangeRows = (rows) => ({ complete: true, rows });
  const reopenLoader = createRecordsLoader({
    listStarterDeviceLinks: async () => windows,
    listCareRecords: markCare, loadWindowClosures: async () => [],
    mobileDeviceService: async () => ({ range: async (deviceId, range) => { calls.push({ deviceId, ...range });
      return rangeRows([sampleOn('2026-10-19', 8, { mode: 'fer', sensor_error: false }), sampleOn('2026-10-20', 8, { mode: 'fer', sensor_error: false }), sampleOn('2026-10-21', 8, { mode: 'fer', sensor_error: false })]); } })
  });
  const marked = await reopenLoader.marks('u1', { from: day('2026-10-19'), to: day('2026-10-22') }, 's1');
  assert.deepEqual(Object.keys(marked).sort(), ['2026-10-19', '2026-10-21'], 'both windows are marked; the unbound day in between is not');
  assert.equal(calls.length, 2, 'one read per historical window, none for the gap');
  assert.equal(marked.failures, 0);
  // 单段失败不清空另一段，失败数暴露给页面，且不缓存以便重试。
  let failNext = true; const retryCalls = [];
  const flaky = createRecordsLoader({
    listStarterDeviceLinks: async () => windows,
    listCareRecords: markCare, loadWindowClosures: async () => [],
    mobileDeviceService: async () => ({ range: async (deviceId, range) => { retryCalls.push(range); if (failNext && retryCalls.length === 1) return { complete: false, rows: [], error: '登录已过期', errorKind: 'auth' };
      return rangeRows([sampleOn('2026-10-21', 8, { mode: 'fer', sensor_error: false })]); } })
  });
  const part = await flaky.marks('u1', { from: day('2026-10-19'), to: day('2026-10-22') }, 's1');
  assert.equal(part.failures, 1); assert.ok(part['2026-10-21'] || part['2026-10-19']);
  failNext = false; const before = retryCalls.length;
  await flaky.marks('u1', { from: day('2026-10-19'), to: day('2026-10-22') }, 's1');
  assert.ok(retryCalls.length > before, 'a partially failed read is retried instead of cached');
}
console.log('mobile records: local dates, formal measurement backgrounds, device-link windows, feeding rounds, closures, missing/failed devices, returnTo and cache contracts passed');
