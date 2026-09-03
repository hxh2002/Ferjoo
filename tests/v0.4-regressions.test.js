#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const D = require('../starter-doctor.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('natural-language exact temperature keeps both Celsius value and bucket', () => {
  const parsed = D.parseStarterInput('成熟种，1:1:1，30℃，5小时，翻倍');
  assert.equal(parsed.temp, 30);
  assert.equal(parsed.tempC, 30);
  assert.equal(parsed.tempBucket, 't_28_32');
  const result = D.diagnoseStarter(parsed);
  assert.equal(result.temp, 't_28_32');
});

test('natural-language elapsed time accepts h, hr, hrs and hours', () => {
  for (const token of ['5h', '5hr', '5hrs', '5hour', '5hours', '5小时']) {
    const parsed = D.parseStarterInput(`成熟种 26℃ ${token} 翻倍`);
    assert.equal(parsed.elapsedHours, 5, token);
  }
});

test('stage-specific missing height returns explicit information-insufficient states', () => {
  const active = D.diagnoseStarter({ stage:'start_active', ratio:'1:1:1', temp:26 });
  assert.equal(active.state, '起种活跃期·信息不足');
  assert.ok(active.reasons.length);
  assert.ok(active.actions.length);

  const stable = D.diagnoseStarter({ stage:'start_stable', ratio:'1:1:1', temp:26 });
  assert.equal(stable.state, '起种稳定期·信息不足');
  assert.ok(stable.reasons.length);
  assert.ok(stable.actions.length);
});

test('contamination predicate is public and preserves negation handling', () => {
  assert.equal(typeof D.isContaminated, 'function');
  assert.equal(D.isContaminated({ notes:'表面出现粉红色斑点' }), true);
  assert.equal(D.isContaminated({ notes:'没有发霉，也没有霉味' }), false);
});

test('high-temperature rules cite multiple temperature/community sources', () => {
  const result = D.diagnoseStarter({
    stage:'mature', ratio:'1:1:1', height:'double', temp:35, elapsedHours:2
  });
  assert.ok(result.evidenceRefs.includes('BRANDT-2004'));
  assert.ok(result.evidenceRefs.includes('VRANCKEN-2011'));
  assert.ok(result.evidenceRefs.includes('CALVERT-2021'));
});

test('ordinary diagnoses carry an explicit diversity/uncertainty trace', () => {
  const result = D.diagnoseStarter({
    stage:'mature', ratio:'1:1:1', height:'double', temp:26, elapsedHours:5
  });
  assert.ok(result.ruleTrace.some((x) => x.ruleId === 'UNCERTAINTY.DIVERSITY'));
  assert.ok(result.evidenceRefs.includes('LANDIS-2021'));
});

test('formatAdvice no longer gates timing by stage', () => {
  const result = D.diagnoseStarter({ stage:'start_d1', ratio:'1:1:1', height:'none', temp:26 });
  const report = D.formatAdvice(result);
  assert.match(report, /预期翻倍时间：约 /);
  assert.doesNotMatch(report, /当前阶段不使用统一翻倍估时/);
});

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
process.stdout.write(`\n${passed}/${tests.length} v0.4 regression tests passed.\n`);
