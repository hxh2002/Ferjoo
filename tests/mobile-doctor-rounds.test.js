import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
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
