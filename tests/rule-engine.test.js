#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as nodeEntry from '../src/algorithms/index.js';
import * as browserEntry from '../src/algorithms/index.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('single public algorithm entrypoint is stable across consumers', () => {
  assert.strictEqual(nodeEntry, browserEntry);
});

test('unknown elapsed time is not coerced to zero', () => {
  const result = nodeEntry.diagnoseStarter({
    stage:'mature', ratio:'1:1:1', height:'none', temp:26, elapsedHours:null
  });
  assert.equal(result.state, '观察时间未知');
  assert.equal(result.elapsedHours, undefined);
  assert.ok(result.ruleTrace.some(item => item.ruleId === 'TIME.UNKNOWN'));
});

test('elapsed time distinguishes early, within-window, and late observations', () => {
  const base = { stage:'mature', ratio:'1:1:1', height:'none', temp:26 };
  assert.equal(nodeEntry.diagnoseStarter({ ...base, elapsedHours:1 }).state, '观察时间尚早');
  assert.equal(nodeEntry.diagnoseStarter({ ...base, elapsedHours:5 }).state, '仍在经验观察窗口');
  const late = nodeEntry.diagnoseStarter({ ...base, elapsedHours:7 });
  assert.equal(late.state, '活性偏慢');
  assert.equal(late.level, 'danger');
});

test('temperatures at or above 35C stop precise timing extrapolation', () => {
  const result = nodeEntry.diagnoseStarter({
    stage:'mature', ratio:'1:1:1', height:'none', temp:35, elapsedHours:2
  });
  assert.equal(result.expectedReliable, false);
  assert.equal(result.expectedMin, null);
  assert.match(result.expectedHours, /不提供.*估时/);
  assert.equal(result.timing.status, 'temperature-out-of-domain');
  assert.ok(result.ruleTrace.some(item => item.ruleId === 'TEMP.HIGH_NONLINEAR'));
  assert.ok(result.evidenceRefs.includes('BRANDT-2004'));
});

test('contamination overrides missing height and reassuring pH', () => {
  const result = nodeEntry.diagnoseStarter({ stage:'mature', color:'粉红', ph:3.5 });
  assert.equal(result.state, '已污染（不可使用）');
  assert.equal(result.level, 'danger');
  assert.match(result.phAssessment.message, /不能推翻整罐弃用/);
  assert.ok(result.evidenceRefs.includes('CSU-STARTER-2025'));
});

test('natural-language parsing carries explicit contamination signals', () => {
  const parsed = nodeEntry.parseStarterInput('成熟种，1:1:1，26℃，表面粉红色斑点并且发霉，几乎不涨');
  assert.equal(parsed.color, '粉红');
  const result = nodeEntry.diagnoseStarter({ ...parsed, notes:parsed.contaminationNotes });
  assert.equal(result.state, '已污染（不可使用）');
});

test('negation and unrelated colors do not create contamination false positives', () => {
  for (const notes of ['没有发霉，也没有霉味', '使用黑麦面粉，容器是绿色的']) {
    const result = nodeEntry.diagnoseStarter({
      stage:'mature', ratio:'1:1:1', height:'double', temp:26, notes
    });
    assert.notEqual(result.state, '已污染（不可使用）', notes);
  }
});

test('stage rules preserve over-peak and liquid-layer meanings', () => {
  const liquid = nodeEntry.diagnoseStarter({ stage:'start_active', height:'hooch', ratio:'1:1:1', temp:26 });
  assert.equal(liquid.state, '起种活跃期·液体层待核验');
  const fallen = nodeEntry.diagnoseStarter({ stage:'start_stable', height:'fallen', ratio:'1:1:1', temp:26 });
  assert.equal(fallen.state, '起种稳定期·已过本轮峰值');
  const fridge = nodeEntry.diagnoseStarter({ stage:'fridge', height:'double', ratio:'1:1:1', temp:4 });
  assert.equal(fridge.state, '冷藏期·需澄清观察时点');
  assert.equal(fridge.expectedReliable, false);
});

test('pH is an auxiliary band, never a raw-consumption clearance', () => {
  const result = nodeEntry.diagnoseStarter({ stage:'mature', height:'double', ph:4.2 });
  assert.equal(result.phAssessment.band, 'below-acidification-reference');
  assert.match(result.phAssessment.message, /仍需结合卫生、污染观察与充分烘烤/);
  assert.ok(result.evidenceRefs.includes('FDA-RAW-FLOUR-2023'));
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
process.stdout.write(`\n${passed}/${tests.length} tests passed.\n`);
