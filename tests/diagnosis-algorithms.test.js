#!/usr/bin/env node
'use strict';

// 系统性覆盖 starter-doctor.browser.js 中全部诊断算法分支：
//   归一化、自然语言解析、污染检测、pH 分层、预期翻倍时间、
//   阶段覆盖、成熟期活性判断、时间上下文、温度上下文、证据追踪与格式化。

const assert = require('node:assert/strict');
const D = require('../starter-doctor.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ----------------------------- 1. 归一化 ----------------------------- */

test('normalizeStage maps canonical values and aliases', () => {
  assert.equal(D.normalizeStage('mature').value, 'mature');
  assert.equal(D.normalizeStage('日常喂养').value, 'mature');
  assert.equal(D.normalizeStage('冰箱').value, 'fridge');
  assert.equal(D.normalizeStage(null), null);
});

test('normalizeRatio maps canonical values and aliases', () => {
  assert.equal(D.normalizeRatio('1:1:1').value, '1:1:1');
  assert.equal(D.normalizeRatio('一比一').value, '1:1:1');
  assert.equal(D.normalizeRatio('硬种').value, '1:2:1');
  assert.equal(D.normalizeRatio('深度重置').value, 'deep_reset');
  assert.equal(D.normalizeRatio(''), null);
});

test('normalizeHeight maps canonical values and aliases', () => {
  assert.equal(D.normalizeHeight('double').value, 'double');
  assert.equal(D.normalizeHeight('翻倍').value, 'double');
  assert.equal(D.normalizeHeight('没变化').value, 'none');
  assert.equal(D.normalizeHeight('酒精层').value, 'hooch');
  assert.equal(D.normalizeHeight(undefined), null);
});

test('tempFromNumber buckets temperature onto discrete ranges with correct coefficients', () => {
  const cases = [
    [14.9, 't_lt15', 2.5],
    [15, 't_15_18', 2.2],
    [17.9, 't_15_18', 2.2],
    [18, 't_18_22', 1.8],
    [21.9, 't_18_22', 1.8],
    [22, 't_22_25', 1.3],
    [24.9, 't_22_25', 1.3],
    [25, 't_25_28', 1.0],
    [27.9, 't_25_28', 1.0],
    [28, 't_28_32', 0.7],
    [32, 't_28_32', 0.7],
    [32.1, 't_gt32', null]
  ];
  for (const [num, bucket, coef] of cases) {
    const out = D.normalizeTemp(num);
    assert.equal(out.value, bucket, `temp ${num} → bucket`);
    assert.equal(out.coef, coef, `temp ${num} → coef`);
    assert.equal(out.num, num, `temp ${num} → num preserved`);
  }
});

test('normalizeTemp accepts number, object, bucket string and natural-language text', () => {
  assert.equal(D.normalizeTemp(26).value, 't_25_28');
  assert.equal(D.normalizeTemp({ value: 't_28_32', num: 30 }).num, 30);
  assert.equal(D.normalizeTemp('t_18_22').value, 't_18_22');
  assert.equal(D.normalizeTemp('30℃').value, 't_28_32');
  assert.equal(D.normalizeTemp('温度约22度').value, 't_22_25');
  assert.equal(D.normalizeTemp('常温').value, 't_25_28');
  assert.equal(D.normalizeTemp(null), null);
  assert.equal(D.normalizeTemp(''), null);
  assert.equal(D.normalizeTemp('无意义输入'), null);
});

/* ------------------------- 2. 自然语言解析 ------------------------- */

test('parseStarterInput extracts stage, ratio, height, temp and elapsed time', () => {
  const parsed = D.parseStarterInput('成熟种，1:1:1，30℃，5小时，翻倍');
  assert.equal(parsed.stage, 'mature');
  assert.equal(parsed.ratio, '1:1:1');
  assert.equal(parsed.height, 'double');
  assert.equal(parsed.temp, 30);
  assert.equal(parsed.tempC, 30);
  assert.equal(parsed.tempBucket, 't_28_32');
  assert.equal(parsed.elapsedHours, 5);
});

test('parseStarterInput recognizes multiple elapsed-time tokens', () => {
  for (const token of ['5h', '5hr', '5hrs', '5hours', '5小时']) {
    const parsed = D.parseStarterInput(`成熟种 26℃ ${token} 翻倍`);
    assert.equal(parsed.elapsedHours, 5, token);
  }
});

/* --------------------------- 3. 污染检测 --------------------------- */

test('isContaminated detects real signals and preserves negation', () => {
  assert.equal(D.isContaminated({ notes: '表面出现粉红色斑点' }), true);
  assert.equal(D.isContaminated({ color: '绿色斑点' }), true);
  assert.equal(D.isContaminated({ smell: '腐臭' }), true);
  assert.equal(D.isContaminated({ notes: '没有发霉，也没有霉味' }), false);
  assert.equal(D.isContaminated({ notes: '使用黑麦面粉，容器是绿色的' }), false);
  assert.equal(D.isContaminated({}), false);
});

/* ------------------------------ 4. pH 分层 ------------------------------ */

test('assessPh classifies all five bands plus invalid input', () => {
  assert.equal(D.assessPh(null), null);
  assert.equal(D.assessPh(''), null);
  assert.equal(D.assessPh(2.4).band, 'invalid');
  assert.equal(D.assessPh(7.1).band, 'invalid');
  assert.equal(D.assessPh(3.0).band, 'below-brand-target');
  assert.equal(D.assessPh(3.5).band, 'brand-target');
  assert.equal(D.assessPh(4.2).band, 'below-acidification-reference');
  assert.equal(D.assessPh(5.0).band, 'above-acidification-reference');
});

/* ------------------------- 5. 预期翻倍时间 ------------------------- */

test('expectedRange multiplies ratio base hours by temperature coefficient', () => {
  assert.deepEqual(
    pick(D.expectedRange('1:1:1', { value: 't_25_28', coef: 1.0 })),
    { min: 4, max: 6, reliable: true }
  );
  assert.deepEqual(
    pick(D.expectedRange('1:1:1', { value: 't_lt15', coef: 2.5 })),
    { min: 10, max: 15, reliable: true }
  );
  assert.deepEqual(
    pick(D.expectedRange('1:1:1', { value: 't_28_32', coef: 0.7 })),
    { min: 2.8, max: 4.2, reliable: true }
  );
});

test('expectedRange covers every ratio baseline', () => {
  const coef1 = { value: 't_25_28', coef: 1.0 };
  assert.deepEqual(pick(D.expectedRange('1:2:2', coef1)), { min: 6, max: 8, reliable: true });
  assert.deepEqual(pick(D.expectedRange('1:3:3', coef1)), { min: 8, max: 12, reliable: true });
  assert.deepEqual(pick(D.expectedRange('1:5:5', coef1)), { min: 12, max: 24, reliable: true });
  assert.deepEqual(pick(D.expectedRange('deep_reset', coef1)), { min: 12, max: 36, reliable: true });
  assert.deepEqual(pick(D.expectedRange('1:2:1', coef1)), { min: 8, max: 12, reliable: true });
});

test('expectedRange stops above 32C and on missing coefficient', () => {
  assert.deepEqual(pick(D.expectedRange('1:1:1', { value: 't_gt32', coef: null })), {
    min: null, max: null, reliable: false
  });
  assert.equal(D.expectedRange('1:1:1', { value: 't_gt32', coef: null }).reason, 'high-temperature-nonlinear');
  assert.deepEqual(pick(D.expectedRange('1:1:1', { value: 't_25_28', coef: null })), {
    min: null, max: null, reliable: false
  });
  assert.equal(D.expectedRange('1:1:1', { value: 't_25_28', coef: null }).reason, 'missing-temperature-coefficient');
});

test('expectedHours renders readable ranges or the high-temperature guard', () => {
  assert.equal(D.diagnoseStarter({ stage: 'mature', ratio: '1:1:1', height: 'double', temp: 26 }).expectedHours, '4 小时~6 小时');
  assert.equal(D.diagnoseStarter({ stage: 'mature', ratio: '1:1:1', height: 'double', temp: 35 }).expectedHours, '高温下不建议估时（先降至 ≤32℃）');
});

test('non-mature stages never use unified doubling estimates', () => {
  const result = D.diagnoseStarter({ stage: 'start_d1', ratio: '1:1:1', height: 'none', temp: 26 });
  assert.equal(result.expectedHours, '当前阶段不使用统一翻倍估时');
  assert.equal(result.expectedReliable, false);
  assert.equal(result.expectedMin, null);
  assert.equal(result.expectedReason, 'stage-specific-baseline');
});

/* ------------------------- 6. 成熟期活性判断 ------------------------- */

test('mature-stage activity judgment maps all eight height branches', () => {
  const run = (height) => D.diagnoseStarter({ stage: 'mature', ratio: '1:1:1', height, temp: 26, elapsedHours: 5 }).state;
  assert.equal(run('none'), '仍在经验观察窗口');
  assert.equal(run('slight'), '正常观察中');
  assert.equal(run('near'), '健康（上升期）');
  assert.equal(run('double'), '巅峰（优先使用窗口）');
  assert.equal(run('peak_plus'), '强活 / 略过峰');
  assert.equal(run('over3'), '过度膨胀');
  assert.equal(run('fallen'), '已过峰（回落）');
  assert.equal(run('hooch'), '饥饿（出现液体层）');
});

/* --------------------------- 7. 阶段覆盖 --------------------------- */

test('start-active stage maps weak, healthy and liquid-layer branches', () => {
  assert.equal(D.diagnoseStarter({ stage: 'start_active', height: 'none', temp: 26 }).state, '起种活跃期·反应偏弱');
  assert.equal(D.diagnoseStarter({ stage: 'start_active', height: 'double', temp: 26 }).state, '起种活跃期·进展正常');
  assert.equal(D.diagnoseStarter({ stage: 'start_active', height: 'hooch', temp: 26 }).state, '起种活跃期·液体层待核验');
  assert.equal(D.diagnoseStarter({ stage: 'start_active', temp: 26 }).state, '起种活跃期·信息不足');
});

test('start-stable stage maps near-mature, over-peak and hunger branches', () => {
  assert.equal(D.diagnoseStarter({ stage: 'start_stable', height: 'double', temp: 26 }).state, '起种完成·接近成熟');
  assert.equal(D.diagnoseStarter({ stage: 'start_stable', height: 'fallen', temp: 26 }).state, '起种稳定期·已过本轮峰值');
  assert.equal(D.diagnoseStarter({ stage: 'start_stable', height: 'hooch', temp: 26 }).state, '起种稳定期·饥饿/分层');
});

test('fridge and revive stages keep their distinct narratives', () => {
  assert.equal(D.diagnoseStarter({ stage: 'fridge', height: 'none', temp: 4 }).state, '冷藏休眠期');
  assert.equal(D.diagnoseStarter({ stage: 'fridge', height: 'double', temp: 4 }).state, '冷藏期·需澄清观察时点');
  assert.equal(D.diagnoseStarter({ stage: 'revive', height: 'double', temp: 26 }).state, '复活恢复期·已恢复');
  assert.equal(D.diagnoseStarter({ stage: 'revive', height: 'none', temp: 26 }).state, '复活恢复期·待唤醒');
});

/* --------------------------- 8. 时间上下文 --------------------------- */

test('elapsed time separates early, within-window, late and unknown observations', () => {
  const base = { stage: 'mature', ratio: '1:1:1', height: 'none', temp: 26 };
  assert.equal(D.diagnoseStarter({ ...base, elapsedHours: 1 }).state, '观察时间尚早');
  assert.equal(D.diagnoseStarter({ ...base, elapsedHours: 5 }).state, '仍在经验观察窗口');
  const late = D.diagnoseStarter({ ...base, elapsedHours: 7 });
  assert.equal(late.state, '活性偏慢');
  assert.equal(late.level, 'danger');
  const unknown = D.diagnoseStarter({ ...base, elapsedHours: null });
  assert.equal(unknown.state, '观察时间未知');
  assert.equal(unknown.elapsedHours, undefined);
});

/* --------------------------- 9. 温度上下文 --------------------------- */

test('temperature above 32C downgrades optimism and adds high-temperature evidence', () => {
  const result = D.diagnoseStarter({ stage: 'mature', ratio: '1:1:1', height: 'double', temp: 35, elapsedHours: 2 });
  assert.equal(result.expectedReliable, false);
  assert.equal(result.level, 'warn');
  assert.ok(result.ruleTrace.some((x) => x.ruleId === 'TEMP.HIGH_NONLINEAR'));
  assert.ok(result.evidenceRefs.includes('BRANDT-2004'));
  assert.ok(result.evidenceRefs.includes('VRANCKEN-2011'));
});

/* --------------------------- 10. 证据追踪 --------------------------- */

test('every diagnosis carries citations, rule trace and the raw-flour baseline', () => {
  const result = D.diagnoseStarter({ stage: 'mature', ratio: '1:1:1', height: 'double', temp: 26, elapsedHours: 5 });
  assert.ok(result.ruleTrace.length > 0);
  assert.ok(result.evidenceRefs.length > 0);
  assert.ok(result.citations.length > 0);
  assert.ok(result.evidenceRefs.includes('FDA-RAW-FLOUR-2023'));
  assert.ok(result.ruleTrace.some((x) => x.ruleId === 'UNCERTAINTY.DIVERSITY'));
});

test('internal Ferjoo evidence ids are marked non-public', () => {
  assert.equal(D.EVIDENCE_CATALOG['FERJOO-EXP-TIME-001'].public, false);
  assert.equal(D.EVIDENCE_CATALOG['FERJOO-EXP-STAGE-001'].public, false);
});

/* --------------------------- 11. 格式化 --------------------------- */

test('formatAdvice renders a readable report without internal ids', () => {
  const result = D.diagnoseStarter({ stage: 'mature', ratio: '1:1:1', height: 'double', temp: 26, elapsedHours: 5 });
  const report = D.formatAdvice(result);
  assert.match(report, /酵种医生 · 诊断报告/);
  assert.match(report, /预期翻倍时间：4 小时~6 小时/);
  assert.match(report, /参考文献：/);
  assert.doesNotMatch(report, /FERJOO-EXP-/);
});

test('formatAdvice marks non-applicable stage timing correctly', () => {
  const result = D.diagnoseStarter({ stage: 'start_d1', ratio: '1:1:1', height: 'none', temp: 26 });
  const report = D.formatAdvice(result);
  assert.match(report, /预期翻倍时间：当前阶段不使用统一翻倍估时/);
});

function pick(obj) {
  return { min: obj.min, max: obj.max, reliable: obj.reliable };
}

let passed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok ${passed + 1} - ${name}\n`);
    throw error;
  }
}
process.stdout.write(`\n${passed}/${tests.length} diagnosis algorithm tests passed.\n`);
