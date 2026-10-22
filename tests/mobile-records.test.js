import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { recentRecordDays, validLocalDay, recordDayRange, normalizeRecordsQuery, recordsDetailTarget, recordsDayModel, recordDeviceMetrics, createRecordsLoader } from '../src/lib/mobile-records.js';

const source = await readFile(new URL('../src/views/mobile/MobileRecords.vue', import.meta.url), 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
compileScript(descriptor, { id: 'records-test' });
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'MobileRecords.vue', id: 'records-test' }).errors, []);
const tokens = await readFile(new URL('../src/assets/tokens.css', import.meta.url), 'utf8');
const mainCss = await readFile(new URL('../src/assets/main.css', import.meta.url), 'utf8');
const mobileCss = await readFile(new URL('../src/assets/mobile.css', import.meta.url), 'utf8');
assert.match(tokens, /--radius-badge:\s*4px/);
for (const css of [mainCss, mobileCss, source, await readFile(new URL('../src/views/mobile/MobileToday.vue', import.meta.url), 'utf8'), await readFile(new URL('../src/views/mobile/MobileTrend.vue', import.meta.url), 'utf8')]) {
  assert.doesNotMatch(css, /border-radius:\s*999px/i, 'pill radius must use shape tokens');
}
assert.match(source, /\.date-cell\{[^}]*border-radius:var\(--radius-control\)/);
assert.match(source, /\.date-grid-shared \.date-cell\{[^}]*min-height:0;height:34px/);
assert.doesNotMatch(source, /\.date-cell\{[^}]*border-radius:\s*\d+%/);
assert.match(source, /recentRecordDays\(\)/);
assert.match(source, /更多日期/);
assert.match(source, /starter-chip/);
assert.match(source, /class="date-controls"[\s\S]*class="starter-picker"[\s\S]*class="date-more"/);
assert.match(source, /class="date-grid date-grid-shared"[\s\S]*v-for="item in dateCells"/);
assert.match(source, /:key="item\.value" :data-date="item\.value"/);
assert.match(source, /const firstRects = new Map[\s\S]*first\.left - last\.left[\s\S]*first\.top - last\.top/);
assert.match(source, /cell\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/);
assert.match(source, /grid-template-rows:repeat\(2,34px\)/);
assert.doesNotMatch(source, /week-rows|weekLabel|compactWeek|blank-|repeat\(6,34px\)|auto-fit/);
assert.match(source, /'一二三四五六日'\[\(date\.getDay\(\) \+ 6\) % 7\]/);
assert.match(source, /prefers-reduced-motion: reduce/);
assert.match(source, /\.date-card \.starter-chip\{[^}]*min-height:32px/);
assert.match(source, /\.date-card \.starter-chip\.active\{border-color:var\(--brand-action\);background:var\(--surface-selected\)/);
assert.match(source, /selectStarter/);
assert.doesNotMatch(source, /全部酵种|所有酵种|m-filters|类型筛选|对象<select|legend=/);
// 离开记录页后 query 必然变化；读取与规范化都必须限定在本页，否则会把详情页或今日页顶回列表。
assert.match(source, /onRecordsPage/);
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
const returnTarget = recordsDetailTarget({ kind: 'device', device_id: 'dev/1', starter_id: 's1', day: days[0] }, '/records?from=2026-10-09');
assert.equal(returnTarget.path, '/devices/dev%2F1/trend');
assert.equal(returnTarget.query.returnTo, '/records?from=2026-10-09');
const feeding = { id: 'f1', kind: 'feeding', starter_id: 's1', occurred_at: '2026-10-22T09:00:00Z', ratio: '1:2:2', input: {} };
const next = { id: 'f2', kind: 'feeding', starter_id: 's1', occurred_at: '2026-10-22T15:00:00Z', input: {} };
const observation = { id: 'o1', kind: 'observation', starter_id: 's1', occurred_at: '2026-10-22T11:00:00Z' };
const model = recordsDayModel({ day: '2026-10-22', facts: [feeding, next, observation], context: { feedings: [feeding, next], closures: [{ feeding_id: 'f1', ended_at: '2026-10-22T13:00:00Z', reason: 'manual', detail: 'fallen' }], closuresComplete: true, notices: [] }, devices: { links: [], samples: [], summaries: [] } });
assert.equal(model.feedingCount, 2);
assert.equal(model.events.filter(row => row.kind === 'feeding').length, 2, 'each feeding is a distinct round anchor');
assert.equal(model.events.find(row => row.id === 'f1').summary.windowEndReason, 'manual');
assert.equal(model.events.find(row => row.id === 'f1').closure.detail, 'fallen');
assert.equal(model.events.find(row => row.id === 'f1').summary.measurementCount, 0, 'no device evidence does not erase feeding facts');
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
const deviceDay = recentRecordDays(clock).at(-1);
const dayStart = new Date(`${deviceDay}T00:00:00`);
// 采样时间取当天且早于当前时刻，避免用例在当天尚未到达固定时刻时被“未来样本”过滤。
const sampleAt = new Date(Math.max(dayStart.getTime() + 1000, clock.getTime() - 1000)).toISOString();
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
