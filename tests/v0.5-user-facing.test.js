#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../starter-doctor.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'research', 'evidence-registry.json'), 'utf8'));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('HOW modal is user-facing and no longer exposes old developer copy', () => {
  assert.match(html, /HOW IT WORKS/);
  assert.match(html, /它如何判断你的酵种/);
  assert.match(html, /连续记录 2–3 个喂养周期/);
  assert.doesNotMatch(html, /HOW IT THINKS/);
  assert.doesNotMatch(html, /核心代理指标/);
  assert.doesNotMatch(html, /黑箱结论/);
});

test('result UI calls citations 参考文献 and uses reference cards', () => {
  assert.match(html, />参考文献</);
  assert.doesNotMatch(html, /证据与规则出处/);
  assert.match(html, /class="reference-list"/);
  assert.match(app, /reference-card/);
  assert.match(css, /\.reference-card\b/);
});

test('old developer-facing disclaimer is removed', () => {
  assert.doesNotMatch(html, /基于规则库与可选观测数据/);
  assert.doesNotMatch(html, /微生物实验室检测/);
  assert.match(html, /仅供家庭烘焙参考/);
  assert.match(html, /生酵种请勿试吃/);
});

test('public report hides internal Ferjoo evidence IDs', () => {
  const result = D.diagnoseStarter({stage:'mature', ratio:'1:1:1', height:'double', temp:26, elapsedHours:5});
  assert.ok(result.evidenceRefs.some(x => x.startsWith('FERJOO-EXP-')), 'internal trace should still exist');
  const report = D.formatAdvice(result);
  assert.match(report, /参考文献：/);
  assert.doesNotMatch(report, /FERJOO-EXP-/);
  assert.doesNotMatch(report, /证据与规则出处/);
  assert.match(report, /The diversity and function of sourdough starter microbiomes/);
});

test('internal citations are marked non-public while academic sources expose display metadata', () => {
  assert.equal(D.EVIDENCE_CATALOG['FERJOO-EXP-TIME-001'].public, false);
  const landis = D.EVIDENCE_CATALOG['LANDIS-2021'];
  assert.equal(landis.public, true);
  assert.equal(landis.kind, '原始研究');
  assert.ok(landis.title);
  assert.ok(landis.displayNote);
});

test('research registry is expanded and CSU review date is corrected', () => {
  assert.equal(registry.cardCount, 30);
  assert.equal(registry.researchCutoff, '2026-08-29');
  for (const id of ['F12','F13','F14']) assert.ok(registry.cards.some(c => c.id === id), id);
  const csu = registry.cards.find(c => c.id === 'FS-01');
  assert.match(csu.citation, /Reviewed October 2025/);
});

test('contamination safety message is written to the user, not as rule priority documentation', () => {
  const result = D.diagnoseStarter({
    stage:'mature', ratio:'1:1:1', height:'double', temp:26,
    notes:'表面出现粉红色绒毛'
  });
  assert.equal(result.state, '已污染（不可使用）');
  assert.ok(result.safety.some(x => /不要继续使用/.test(x)));
  assert.ok(result.safety.every(x => !/规则优先/.test(x)));
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    passed++;
    process.stdout.write(`ok ${passed} - ${name}\n`);
  } catch (err) {
    process.stderr.write(`not ok ${passed + 1} - ${name}\n`);
    throw err;
  }
}
process.stdout.write(`\n${passed}/${tests.length} v0.5 user-facing tests passed.\n`);
