import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { formatDiagnosisRecord, formatDoctorRound } from '../src/lib/mobile-records.js';
import { isMobilePath } from '../src/lib/accountNavigation.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function compile(file) {
  const source = read(file);
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, [], file);
  const script = compileScript(descriptor, { id: file });
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, [], file);
  return source;
}

const occurred = new Date(2026, 10, 6, 9, 30);
const round = formatDoctorRound({ occurred_at: occurred.toISOString(), ratio: '1:2:2' });
assert.equal(round.title, '09:30 喂养');
assert.equal(round.detail, '喂养记录 · 1 : 2 : 2');
assert.equal(formatDoctorRound({ occurred_at: occurred.toISOString(), ratio: '1:2:2' }, { elapsedHours: 6 }).detail, '喂养记录 · 1 : 2 : 2 · 6 小时');
assert.equal(formatDoctorRound({ occurred_at: occurred.toISOString(), ratio: '1:2:2' }, { elapsedHours: 6, closed: true }).detail, '已结束 · 1 : 2 : 2 · 6 小时');
assert.equal(formatDoctorRound({ occurred_at: 'invalid', ratio: 'deep_reset' }).title, '--:-- 喂养');
assert.match(formatDoctorRound({ occurred_at: occurred.toISOString(), ratio: '' }).detail, /比例未记录/);
assert.equal(isMobilePath('/doctor/rounds'), true);

// 542:3055 诊断记录：按所诊断的喂养轮次显示日期与时刻，缺少轮次时退回诊断时刻。
const fedAt = new Date(2026, 9, 23, 9, 0);
const feedingId = '33333333-3333-4333-8333-333333333333';
assert.deepEqual(formatDiagnosisRecord({ occurred_at: new Date(2026, 9, 24, 15, 0).toISOString(), input: { feedingId, evidenceSnapshot: { windowFrom: fedAt.toISOString() } }, result: { title: '活力正常' } }), { title: '活力正常', detail: '10 月 23 日 · 09:00 喂养', diagnosed: '诊断于 10 月 24 日 15:00' });
assert.deepEqual(formatDiagnosisRecord({ occurred_at: new Date(2026, 9, 21, 18, 30).toISOString(), input: { feedingId }, result: {} }), { title: '诊断结果', detail: '10 月 21 日 · 18:30 诊断', diagnosed: '' });
// 真实数据里 windowFrom 可能是 null（老记录 / 证据缺失）：new Date(null) 会落到 1970-01-01，
// 不能把诊断记录标成错误日期，必须退回诊断时刻。
assert.deepEqual(formatDiagnosisRecord({ occurred_at: new Date(2026, 9, 21, 18, 30).toISOString(), input: { feedingId, evidenceSnapshot: { windowFrom: null } }, result: { title: '活力正常' } }), { title: '活力正常', detail: '10 月 21 日 · 18:30 诊断', diagnosed: '' });
assert.deepEqual(formatDiagnosisRecord({ occurred_at: new Date(2026, 9, 21, 18, 30).toISOString(), input: { feedingId, evidenceSnapshot: { windowFrom: '' } }, result: {} }), { title: '诊断结果', detail: '10 月 21 日 · 18:30 诊断', diagnosed: '' });
assert.equal(formatDiagnosisRecord({ occurred_at: 'invalid', input: { feedingId } }).detail, '日期不可用 · --:-- 诊断');
// 脏数据只降级显示，不抛错。
assert.deepEqual(formatDiagnosisRecord({ occurred_at: new Date(2026, 9, 21, 18, 30).toISOString(), input: null, result: null }), { title: '诊断结果', detail: '10 月 21 日 · 18:30 诊断', diagnosed: '' });
assert.deepEqual(formatDiagnosisRecord(null), { title: '诊断结果', detail: '日期不可用 · --:-- 诊断', diagnosed: '' });
assert.equal(formatDiagnosisRecord({ occurred_at: '2026-10-21T10:30:00Z', input: { evidenceSnapshot: { windowFrom: 42 } } }).detail.endsWith('诊断'), true, 'a non-string windowFrom falls back to the diagnosis time');

const rounds = compile('src/views/mobile/MobileDoctorRounds.vue');
assert.match(rounds, /该日期暂无喂养记录，请选择其他日期/);
assert.match(rounds, /选择发酵轮次/);
assert.match(rounds, /mode: 'diagnosis'/);
assert.match(read('src/router/index.js'), /doctor\/rounds/);
assert.match(rounds, /class="records-entry" :to="recordsTarget"/, 'the rounds page links to the diagnosis records');
assert.match(rounds, /message="诊断记录已保存" subtitle="可在此查看"/, 'saving a result returns here with a toast');
const records = compile('src/views/mobile/MobileDoctorRecords.vue');
assert.match(records, /kind: 'observation', diagnosisOnly: true, limit: 50/, 'the records page asks the database for diagnoses only');
assert.match(records, /还没有保存过诊断结果/);
assert.match(records, /class="empty-return" to="\/doctor\/rounds"/, 'the empty diagnosis list offers a path back to the rounds');
assert.match(read('src/router/index.js'), /path: 'doctor\/records'[^}]*requiresAuth: true/);
const report = compile('src/views/mobile/MobileReport.vue');
assert.match(report, /canSave \? '保存结果' : '完成'/, 'the result page saves from the primary button');
assert.match(report, /replaceDiagnosis\(\{ \.\.\.snapshot\(report\.value\.input\)/, 'redo writes the diagnosis draft, not the observation draft');
assert.match(report, /mode: 'diagnosis', redo: '1'/, 'redo marks the visit so the prefilled draft survives the diagnosis reset');
assert.match(report, /path: '\/doctor\/rounds', query: \{ saved: '1'/);
assert.match(report, /empty-return"[^>]*:to="cloud \? '\/doctor\/records' : '\/doctor\/rounds'"/, 'the missing-result state returns to records or rounds');
assert.doesNotMatch(report, /保存到日记/, 'saved results belong to the diagnosis records, not a diary wording');

// 370:18820「00b / 酵种医生 / 选择年月」：年月双列滚轮右下角有「完成 / 收起年月」（370:18962，64×26，字色 #b84f14），与日记页同款。
const monthBlock = rounds.slice(rounds.indexOf('<div v-if="picker === \'month\'"'), rounds.indexOf('<div v-if="loading"'));
assert.match(monthBlock, /<button type="button" class="month-wheel-done" @click="finishMonth">完成<\/button>/, 'the month wheels render a 完成 button');
assert.equal((monthBlock.match(/<MWheelPicker/g) || []).length, 2, 'year and month wheels are both inside the panel');
const diarySource = read('src/views/mobile/MobileDiary.vue');
assert.match(diarySource, /<button type="button" class="month-wheel-done" @click="monthPicker = false">完成<\/button>/, 'the diary reference button exists');
for (const rule of ['.month-wheels', '.month-wheel-caption', '.month-wheel-done']) {
  const css = (source) => source.match(new RegExp(`${rule.replace('.', '\\.')}\\{[^}]*\\}`))?.[0];
  assert.equal(css(rounds), css(diarySource), `${rule} reuses the diary month wheel style`);
}
assert.match(rounds, /\.month-wheel-done\{[^}]*color:var\(--m-text-link\)/, 'the done colour is a token');
assert.doesNotMatch(rounds.match(/\.month-wheel-done\{[^}]*\}/)[0], /#[0-9a-f]{3,8}\b/i, 'no hard-coded colour on the done button');

// 真实执行 script setup：滚轮选年月只改日期，「完成」收起滚轮并保留已选年月。
async function doctorRoundsHarness() {
  const descriptor = parse(rounds).descriptor;
  const compiled = compileScript(descriptor, { id: 'doctor-rounds-month-test' });
  const setupCode = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, path) => {
    if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(path)}];`;
    return `const ${bindings.trim()} = modules[${JSON.stringify(path)}];`;
  }).replace('export default', 'return');
  const route = Vue.reactive({ query: {}, fullPath: '/doctor/rounds', path: '/doctor/rounds' });
  const router = { replace(target) { route.query = { ...target.query }; return Promise.resolve(); }, push() {} };
  const modules = {
    vue: { ...Vue, inject: () => null, onMounted() {}, onBeforeUnmount() {} },
    'vue-router': { useRoute: () => route, useRouter: () => router },
    '../../composables/useAuth.js': { useAuth: () => ({ user: Vue.ref({ id: 'u1' }), ready: Vue.ref(true), init: async () => {} }) },
    '../../services/care.service.js': { listCareRecords: async () => [] },
    '../../services/feeding-analysis.service.js': { loadFeedingEvidence: async () => null },
    '../../lib/mobile-records.js': await import('../src/lib/mobile-records.js'),
    '../../lib/uuid.js': await import('../src/lib/uuid.js'),
    '../../lib/mobile-guest.js': await import('../src/lib/mobile-guest.js'),
    '../../components/mobile/MCalendar.vue': {},
    '../../components/mobile/MWheelPicker.vue': {},
    '../../components/mobile/MGuestNotice.vue': {}
  };
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const vm = Vue.proxyRefs(scope.run(() => component.setup({}, { expose() {} })));
  for (let i = 0; i < 8; i++) await Promise.resolve();
  return { vm, route, stop: () => scope.stop() };
}
const doctor = await doctorRoundsHarness();
const earlier = new Date(); earlier.setDate(1); earlier.setMonth(earlier.getMonth() - 2);
const targetYear = String(earlier.getFullYear());
const targetMonth = String(earlier.getMonth() + 1).padStart(2, '0');
doctor.vm.picker = 'day';
doctor.vm.picker = 'month';
doctor.vm.chooseMonth(targetYear, targetMonth);
assert.equal(doctor.vm.day.slice(0, 7), `${targetYear}-${targetMonth}`, 'the wheels write the chosen year and month into the date');
assert.equal(doctor.vm.picker, 'month', 'scrolling the wheels keeps the panel open');
const pickedDay = doctor.vm.day;
doctor.vm.finishMonth();
assert.notEqual(doctor.vm.picker, 'month', '完成 collapses the month wheels');
assert.equal(doctor.vm.picker, 'day', '完成 returns to the calendar, like the diary page');
assert.equal(doctor.vm.day, pickedDay, '完成 keeps the chosen year and month');
assert.equal(doctor.route.query.date, pickedDay, 'the chosen date stays in the route query');
doctor.stop();

const checkin = compile('src/views/mobile/MobileCheckin.vue');
assert.match(checkin, /MRadioCard/);
assert.match(checkin, /请勿品尝生酵种。[\s\S]{0,80}设备不能判断颜色、气味或食品安全/);
assert.match(checkin, /查看更多情况/);
assert.match(checkin, /\[\.\.\.mobileOptions\.height, \{ value: 'unknown', label: '不确定' \}\]/, 'expanded rise options keep 不确定 last');
assert.match(checkin, /补充一句话（可选）/);
assert.doesNotMatch(checkin, /示例数据/, 'the review step shows real choices, not prototype placeholder copy');
assert.match(checkin, /本次还缺少/, 'an incomplete review lists the missing fields instead of inventing data');
assert.match(checkin, /请在颜色与气味两步主动选择/, 'the recognition hint matches where colour and smell are actually answered');
assert.doesNotMatch(checkin, /请在上方重新主动选择/, 'the phrase-by-phrase hint no longer points at a step that is gone');
assert.match(checkin, /酵种闻起来怎么样？/);
assert.match(checkin, /无法判断时，请选择“不确定”。/);
assert.match(checkin, /最后一步/);
assert.match(checkin, /请核对后再生成建议。/);
assert.match(checkin, /diagnosisReviewLabels = \{ color: '颜色 \/ 霉斑', smell: '气味', height: '涨幅表现', ratio: '喂养比例', elapsedHours: '喂养后经过' \}/);
assert.match(checkin, /彩色斑块 \/ 绒毛霉菌/);
assert.match(checkin, /MRadioCard :model-value="draft\[key\]"/);
assert.doesNotMatch(checkin, /<select[\s\S]{0,180}彩色斑块/);
assert.match(checkin, /function selectBackground/);
assert.match(checkin, /backgroundOptions\(key\)/);
assert.doesNotMatch(checkin, /<select/);

// 结果页 / 诊断记录接线：一句话识别出的颜色、气味能就地跳回对应步骤；记录卡片标题不再单行截断。
assert.match(checkin, /@click="observePart = key === 'color' \? 1 : 2">返回\{\{ key === 'color' \? '颜色' : '气味' \}\}这一步/);
assert.match(checkin, /draft\.value\.feedingId \|\| \(typeof route\.query\.feeding === 'string'/, 'a diagnosis keeps its round even when the evidence failed to load');
assert.match(report, /saveObservation\(observationSavePayload\(original\)\)/, 'the result page saves the exact payload the contract below exercises');
assert.match(records, /<small v-if="record\.diagnosed">/);
assert.match(records, /-webkit-line-clamp:2/);
assert.doesNotMatch(records, /\.record-card strong\{[^}]*white-space:nowrap/);
assert.match(rounds, /\.records-entry::before\{content:'';position:absolute;inset:-4px 0\}/, 'the 36px capsule keeps a 44px touch target');

// ---------- 契约：生成 → 保存 → 列表 → 记录卡片，按 015 的 save_care_record 语义模拟数据库 ----------
{
  const { emptyCheckin, generateMobileReport, observationSavePayload } = await import('../src/services/mobile-diagnosis.service.js');
  const cache = await import('../src/lib/read-cache.js');
  const { isDeepStrictEqual } = await import('node:util');
  const USER = '11111111-1111-4111-8111-111111111111';
  const STARTER = '22222222-2222-4222-8222-222222222222';
  const table = [];
  let failNextAfterWrite = false;
  // 与 015 一致：on conflict (user_id, request_id) do nothing，再读回并逐列比对，不一致抛 REQUEST_ID_CONFLICT。
  function saveCareRecord(params) {
    let row = table.find((item) => item.user_id === USER && item.request_id === params.p_request_id);
    if (!row) {
      row = { id: `rec-${table.length + 1}`, user_id: USER, request_id: params.p_request_id, starter_id: params.p_starter_id, kind: params.p_kind, occurred_at: params.p_occurred_at, input: structuredClone(params.p_input), result: structuredClone(params.p_result), ratio: params.p_ratio, created_at: new Date().toISOString() };
      table.push(row);
    }
    const same = row.starter_id === params.p_starter_id && row.kind === params.p_kind && Date.parse(row.occurred_at) === Date.parse(params.p_occurred_at)
      && isDeepStrictEqual(row.input, params.p_input) && isDeepStrictEqual(row.result, params.p_result) && row.ratio === params.p_ratio;
    if (!same) return { data: null, error: { code: '23505', message: 'REQUEST_ID_CONFLICT' } };
    if (failNextAfterWrite) { failNextAfterWrite = false; return { data: null, error: { message: 'Failed to fetch' } }; }
    return { data: [structuredClone(row)], error: null };
  }
  function select() {
    const filters = [];
    const orders = [];
    let range = null;
    const builder = {
      select() { return builder; },
      order(column, { ascending }) { orders.push([column, ascending]); return builder; },
      eq(column, value) { filters.push((row) => row[column] === value); return builder; },
      gte(column, value) { filters.push((row) => Date.parse(row[column]) >= Date.parse(value)); return builder; },
      lt(column, value) { filters.push((row) => Date.parse(row[column]) < Date.parse(value)); return builder; },
      range(from, to) { range = [from, to]; return builder; },
      // 只实现诊断过滤用到的 PostgREST 形式：not('<列>->><键>', 'is', null)。
      not(column, operator, value) {
        const [, jsonColumn, jsonKey] = column.match(/^(\w+)->>(\w+)$/) || [];
        assert.ok(jsonColumn && operator === 'is' && value === null, `unsupported not(${column}, ${operator}, ${value})`);
        filters.push((row) => row[jsonColumn]?.[jsonKey] != null);
        return builder;
      },
      then(resolve, reject) {
        const compare = (a, b) => { for (const [column, ascending] of orders) { const x = column === 'occurred_at' ? Date.parse(a[column]) : a[column]; const y = column === 'occurred_at' ? Date.parse(b[column]) : b[column]; if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1); } return 0; };
        let data = table.filter((row) => filters.every((keep) => keep(row))).sort(compare).map((row) => structuredClone(row));
        if (range) data = data.slice(range[0], range[1] + 1);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      }
    };
    return builder;
  }
  const client = { rpc: async (name, params) => { assert.equal(name, 'save_care_record'); return saveCareRecord(params); }, from: (name) => { assert.equal(name, 'care_records'); return select(); } };
  const code = read('src/services/care.service.js')
    .replace(/import\s+\{([^}]*)\}\s+from\s+'\.\.\/lib\/supabase\.js';/, 'const {$1} = modules.supabase;')
    .replace(/import\s+\{([^}]*)\}\s+from\s+'\.\.\/lib\/read-cache\.js';/, 'const {$1} = modules.cache;')
    .replace(/\bexport function /g, 'function ')
    + '\nreturn { saveObservation, listCareRecords };';
  const care = new Function('modules', code)({ supabase: { hasSupabaseConfig: true, supabase: client }, cache });

  const windowFrom = new Date(2026, 9, 23, 9, 0).toISOString();
  // MobileCheckin 在诊断模式下写入的真实字段：feedingId + evidenceSnapshot（windowFrom 来自 summarizeFeedingMeasurements）。
  const draft = { ...emptyCheckin(), starterId: STARTER, color: 'normal', smell: 'normal', stage: 'mature', ratio: '1:2:2', height: 'double', tempC: 26, elapsedHours: 5, feedingId, evidenceSnapshot: { source: 'feeding-analysis.service', feedingId, windowFrom, windowTo: null } };
  const first = generateMobileReport(draft, USER).report;
  first.occurredAt = new Date(Date.now() - 3600_000).toISOString();

  // 网络在写入成功后断开：第一次报错，同一份结果再点保存拿回同一条，而不是新增。
  failNextAfterWrite = true;
  await assert.rejects(care.saveObservation(observationSavePayload(first)), { message: 'Failed to fetch' });
  const saved = await care.saveObservation(observationSavePayload(first));
  assert.equal(table.length, 1, 'retrying the same result does not duplicate the record');
  assert.equal(saved.id, 'rec-1');
  // 保存成功后刷新：会话里的报告经 JSON 往返后仍是同一份载荷，再存一次仍命中原记录。
  const reloaded = JSON.parse(JSON.stringify({ ...first, savedId: null }));
  assert.equal((await care.saveObservation(observationSavePayload(reloaded))).id, 'rec-1');
  assert.equal(table.length, 1);
  // 同一编号配不同内容：拒绝覆盖。
  await assert.rejects(care.saveObservation({ ...observationSavePayload(first), result: { ...first.result, title: '被改过' } }), /原记录不会被覆盖/);

  // 「重新观察」重新生成：新的 requestId，存成第二条，不覆盖第一条。
  const second = generateMobileReport({ ...draft, height: 'slight' }, USER).report;
  assert.notEqual(second.requestId, first.requestId);
  await care.saveObservation(observationSavePayload(second));
  assert.equal(table.length, 2);

  // 数据库行的真实形状：input / result 是顶层 jsonb 列，不在 payload 下。
  const stored = table[0];
  assert.equal(stored.kind, 'observation');
  assert.equal(stored.ratio, null);
  assert.equal(stored.input.evidenceSnapshot.windowFrom, windowFrom);
  assert.equal(stored.input.feedingId, feedingId);
  assert.equal(stored.input.schemaVersion, 'mobile-observation-v1');
  assert.equal(stored.result.title, first.result.title);
  assert.equal('payload' in stored, false);

  // 旧版通用观察：同为 kind=observation，但 input 里没有 feedingId，且比两条诊断都新。
  table.push({ id: 'legacy', user_id: USER, request_id: '44444444-4444-4444-8444-444444444444', starter_id: STARTER, kind: 'observation', occurred_at: new Date(Date.parse(second.occurredAt) + 1000).toISOString(), input: { color: 'normal', smell: 'normal' }, result: { title: '旧观察' }, ratio: null });
  cache.invalidateReadCache('care:records');
  assert.deepEqual((await care.listCareRecords({ userId: USER, kind: 'observation', limit: 50 })).map((row) => row.id), ['legacy', 'rec-2', 'rec-1'], 'other callers still see every observation');
  const list = await care.listCareRecords({ userId: USER, kind: 'observation', diagnosisOnly: true, limit: 50 });
  assert.deepEqual(list.map((row) => row.id), ['rec-2', 'rec-1'], 'newest diagnosis first, legacy observations filtered in the query');
  // 过滤发生在分页之前：取 1 条拿到的是最新诊断，而不是被丢弃的旧观察。
  assert.deepEqual((await care.listCareRecords({ userId: USER, kind: 'observation', diagnosisOnly: true, limit: 1 })).map((row) => row.id), ['rec-2']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'input', 'kind', 'occurred_at', 'ratio', 'result', 'starter_id']);
  const cards = list.map(formatDiagnosisRecord);
  assert.equal(cards[1].title, first.result.title);
  assert.notEqual(cards[1].title, '诊断结果');
  assert.equal(cards[1].detail, '10 月 23 日 · 09:00 喂养');
  // 同一轮诊断两次：喂养时刻相同，靠诊断时刻区分。
  assert.equal(cards[0].detail, cards[1].detail);
  assert.notEqual(cards[0].diagnosed, cards[1].diagnosed);
}

console.log('mobile doctor rounds: round labels, route and diagnosis radio cards passed');
