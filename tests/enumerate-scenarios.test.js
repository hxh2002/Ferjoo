#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  canonicalAxisValues,
  normalizeAxes,
  combinationCount,
  scenarioInputs,
  validateDiagnosis,
  generateReport,
  reportToNdjson,
  selfCheck
} from '../src/algorithms/enumerate-scenarios.js';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('canonical axes produce all 2,016 combinations in deterministic order', () => {
  const axes = canonicalAxisValues();
  assert.deepEqual(
    Object.fromEntries(Object.entries(axes).map(([key, values]) => [key, values.length])),
    { stage: 6, ratio: 6, height: 8, temp: 7 }
  );
  assert.equal(combinationCount(axes), 2016);
  const inputs = [...scenarioInputs(axes)];
  assert.equal(inputs.length, 2016);
  assert.deepEqual(inputs[0], {
    stage: 'start_d1',
    ratio: '1:1:1',
    height: 'none',
    temp: 't_lt15'
  });
  assert.deepEqual(inputs.at(-1), {
    stage: 'mature',
    ratio: '1:2:1',
    height: 'hooch',
    temp: 't_gt32'
  });
});

test('the current rule engine assigns every valid scenario to a narrative class', () => {
  const report = generateReport();
  assert.equal(report.summary.rawCombinationCount, 2016);
  assert.equal(report.summary.processedScenarioCount, 2016);
  assert.equal(report.summary.validScenarioCount, 2016);
  assert.equal(report.summary.anomalyScenarioCount, 0);
  assert.equal(report.summary.invalidOutputScenarioCount, 0);
  assert.equal(report.summary.missingOutputScenarioCount, 0);
  assert.equal(report.summary.thrownErrorScenarioCount, 0);
  assert.ok(report.summary.narrativeEquivalenceClassCount > 0);
  assert.ok(report.summary.narrativeEquivalenceClassCount < 2016);
  assert.equal(report.summary.classMemberCount, 2016);
  assert.deepEqual(selfCheck(report), []);
});

test('axis subsets reduce the Cartesian product without changing canonical validation', () => {
  const axes = normalizeAxes({
    stage: ['mature', 'fridge'],
    ratio: ['1:1:1'],
    height: ['double', 'hooch'],
    temp: ['t_25_28']
  });
  const report = generateReport({ axes });
  assert.equal(report.summary.rawCombinationCount, 4);
  assert.equal(report.scenarios.length, 4);
  assert.throws(() => normalizeAxes({ temp: ['26C'] }), /Unknown temp value/);
  assert.throws(() => normalizeAxes({ height: [] }), /non-empty array/);
});

test('the validator detects missing fields, empty narrative, and axis mismatch', () => {
  const input = { stage: 'mature', ratio: '1:1:1', height: 'double', temp: 't_25_28' };
  const broken = {
    stage: 'fridge',
    ratio: '1:1:1',
    height: 'double',
    temp: 't_25_28',
    stageLabel: '冷藏',
    ratioLabel: '1:1:1',
    heightLabel: '翻倍',
    tempLabel: '25-28℃',
    expectedHours: '4~6 小时',
    state: '测试',
    level: 'mystery',
    reasons: [],
    actions: [],
    safety: []
  };
  const codes = validateDiagnosis(input, broken).map((entry) => entry.code);
  assert.ok(codes.includes('EMPTY_REASONS'));
  assert.ok(codes.includes('EMPTY_ACTIONS'));
  assert.ok(codes.includes('INVALID_LEVEL'));
  assert.ok(codes.includes('AXIS_ECHO_MISMATCH'));
});

test('the validator checks a traceable evidence contract when the engine exposes one', () => {
  const input = { stage: 'mature', ratio: '1:1:1', height: 'double', temp: 't_25_28' };
  const report = generateReport({ axes: Object.fromEntries(
    Object.entries(input).map(([name, value]) => [name, [value]])
  ) });
  const result = { ...report.scenarios[0].result, citations: [] };
  const codes = validateDiagnosis(input, result).map((entry) => entry.code);
  assert.ok(codes.includes('UNRESOLVED_EVIDENCE_REF'));
});

test('engine exceptions and missing outputs become report anomalies', () => {
  const oneScenario = {
    stage: ['mature'],
    ratio: ['1:1:1'],
    height: ['double'],
    temp: ['t_25_28']
  };
  const thrown = generateReport({
    axes: oneScenario,
    diagnose() {
      throw new Error('synthetic engine failure');
    }
  });
  assert.equal(thrown.summary.anomalyScenarioCount, 1);
  assert.equal(thrown.summary.thrownErrorScenarioCount, 1);
  assert.equal(thrown.anomalies[0].issues[0].code, 'ENGINE_ERROR');

  const missing = generateReport({ axes: oneScenario, diagnose: () => null });
  assert.equal(missing.summary.anomalyScenarioCount, 1);
  assert.equal(missing.summary.missingOutputScenarioCount, 1);
  assert.equal(missing.anomalies[0].issues[0].code, 'MISSING_RESULT');
});

test('NDJSON is line-delimited and contains metadata, scenarios, classes, and summary', () => {
  const report = generateReport({
    axes: {
      stage: ['mature'],
      ratio: ['1:1:1'],
      height: ['double'],
      temp: ['t_25_28']
    }
  });
  const records = reportToNdjson(report).trimEnd().split('\n').map(JSON.parse);
  assert.equal(records[0].type, 'metadata');
  assert.equal(records.filter((record) => record.type === 'scenario').length, 1);
  assert.equal(records.filter((record) => record.type === 'equivalenceClass').length, 1);
  assert.equal(records.at(-1).type, 'summary');
});

test('CLI self-check exits successfully', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const run = spawnSync(process.execPath, ['src/algorithms/enumerate-scenarios.js', '--self-check'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Scenarios: 2016; narrative classes: \d+; anomalies: 0/);
  assert.match(run.stdout, /Self-check passed/);
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
