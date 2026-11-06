import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { formatDoctorRound } from '../src/lib/mobile-records.js';
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

const rounds = compile('src/views/mobile/MobileDoctorRounds.vue');
assert.match(rounds, /该日期暂无喂养记录，请选择其他日期/);
assert.match(rounds, /选择发酵轮次/);
assert.match(rounds, /mode: 'diagnosis'/);
assert.match(read('src/router/index.js'), /doctor\/rounds/);

const checkin = compile('src/views/mobile/MobileCheckin.vue');
assert.match(checkin, /MRadioCard/);
assert.match(checkin, /请勿品尝生酵种。[\s\S]{0,80}设备不能判断颜色、气味或食品安全/);
assert.match(checkin, /查看更多情况/);
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

console.log('mobile doctor rounds: round labels, route and diagnosis radio cards passed');
