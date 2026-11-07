import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { recentRecordDays, validLocalDay, recordDayRange, normalizeRecordsQuery, recordsDetailTarget, recordsDayModel, recordDeviceMetrics, roundState, createRecordsLoader } from '../src/lib/mobile-records.js';

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
assert.match(checkinSource, /\.step-track li\.active \.step-dot\{background:var\(--brand-action\)/);
assert.match(checkinSource, /checkin-starter/);
// 一级页面只保留设备在线时间与采样数，曲线下放到各轮次，采样明细仍走设备二级页。
assert.match(source, /deviceBlocks/);
assert.match(source, /单日数据/);
assert.match(source, /在线 \{\{ item\.online \}\}/);
assert.match(source, /\{\{ item\.count \}\} 条采样/);
assert.match(source, /name: rows\.length > 1 \? `\$\{selectedStarterName\.value \|\| '酵种'\}/, 'device summary is titled by the selected starter');
assert.match(source, /class="m-list-row record-row device-row"/);
assert.match(source, /最高膨胀率/);
assert.match(source, /平均温度/);
assert.match(source, /平均湿度/);
// 轮次卡片是当天的主线，单日设备摘要排在卡片之后。
assert.ok(source.indexOf('record-group round-group') < source.indexOf('record-group chart-group'), 'rounds appear above the day summary');
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
  listStarterDeviceLinks: async ({starterId}) => [{starter_id:starterId,device_id:starterId,active_from:activeFrom,active_to:null}],
  mobileDeviceService: async () => ({ range: async (deviceId) => { if (deviceId === 'broken') throw new Error('offline'); return { complete:true, rows:[{id:'sample',device_id:deviceId,recorded_at:sampleAt,mode:'fer',sensor_error:false,height_mm:30}] }; } }),
  listCareRecords: async () => [], loadWindowClosures: async () => []
});
const partial = await failingLoader.devices('u1',deviceDay,['ok','broken']);
assert.equal(partial.summaries.length,1,'one device failure does not prevent the working linked device summary');
assert.ok(partial.notices.some(value => value.includes('设备数据读取失败')));
assert.equal(partial.samples[0].device_id,'ok','only linked device sample is used');
console.log('mobile records: local dates, two-week/history URLs, feeding rounds, cross-day continuation, closures, missing/failed devices, returnTo and cache contracts passed');
