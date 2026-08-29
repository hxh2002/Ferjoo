#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const doctor = require('../starter-doctor.js');
const { generateReport } = require('./enumerate-scenarios.js');

const SCHEMA = 'dr-ferjoo/review-queue/v1';

function stableId(kind, input) {
  const digest = crypto.createHash('sha256').update(JSON.stringify({ kind, input })).digest('hex').slice(0, 16);
  return `review-${kind}-${digest}`;
}

function makeItem(kind, input, classification, reviewReason) {
  const result = doctor.diagnoseStarter(input);
  const unresolvedEvidenceRefs = (result.evidenceRefs || []).filter(ref => ref.startsWith('FERJOO-EXP-'));
  return {
    id: stableId(kind, input),
    kind,
    input,
    classification,
    reviewReason,
    workflow: [
      { step:'核验', status:'pending', requirement:'核对状态、严重度、解释、阶段语义与可执行性' },
      { step:'检索', status:unresolvedEvidenceRefs.length ? 'required' : 'verify-existing', requirement:'复核 evidenceRefs；缺口触发二次权威检索' },
      { step:'重写', status:'pending', requirement:'结合用户当前阶段重写上下文、限制条件和最后建议' }
    ],
    evidenceCoverage: {
      refs: result.evidenceRefs || [],
      unresolvedExperienceRefs: unresolvedEvidenceRefs,
      status: unresolvedEvidenceRefs.length ? 'provisional' : 'traceable'
    },
    result,
    formattedAdvice: doctor.formatAdvice(result)
  };
}

function uniqueNumbers(values) {
  return [...new Set(values.map(value => value == null ? 'null' : Number(value).toFixed(3)))]
    .map(value => value === 'null' ? null : Number(value));
}

function buildReviewQueue() {
  const items = [];
  const seen = new Set();
  const add = (kind, input, classification, reason) => {
    const item = makeItem(kind, input, classification, reason);
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  const common = {
    validity:'valid', consistency:'consistent', plausibility:'common', dominance:'none'
  };

  // 1. Safety overrides first: these must remain stable regardless of activity inputs.
  const safetySignals = [
    { color:'粉红' }, { color:'橙色' }, { color:'黑色斑点' }, { color:'绿色斑点' },
    { color:'发霉长毛' }, { smell:'腐臭' }, { smell:'氨味' }, { smell:'霉味' }
  ];
  for (const signal of safetySignals) {
    add('safety-dominance', { stage:'mature', ratio:'1:1:1', height:'double', temp:26, ph:3.5, ...signal },
      { ...common, dominance:'safety_override' }, '确认污染硬停止规则覆盖高度、活性和看似正常的 pH');
  }
  add('safety-missing-height', { stage:'mature', ratio:'1:1:1', height:null, temp:26, color:'粉红', ph:3.5 },
    { ...common, validity:'missing_required', dominance:'safety_override' }, '确认污染结论不依赖高度字段完整');
  add('safety-negation', { stage:'mature', ratio:'1:1:1', height:'double', temp:26, notes:'没有发霉，也没有霉味' },
    { ...common, consistency:'requires_clarification' }, '确认否定表达不触发弃用');
  add('safety-unrelated-color', { stage:'mature', ratio:'1:1:1', height:'double', temp:26, notes:'使用黑麦面粉，容器是绿色的' },
    { ...common, consistency:'requires_clarification' }, '确认原料/容器颜色不被当作酵种污染');

  // 2. Timing boundaries: enumerate semantic boundaries rather than all 0..48 integers.
  for (const ratio of doctor.RATIOS) {
    for (const temp of doctor.TEMPS) {
      const probe = doctor.diagnoseStarter({ stage:'mature', ratio:ratio.value, height:'double', temp:temp.value });
      const points = probe.expectedReliable
        ? uniqueNumbers([null, 0, Math.max(0, probe.expectedMin - 0.5), probe.expectedMin,
            (probe.expectedMin + probe.expectedMax) / 2, probe.expectedMax, probe.expectedMax + 0.5])
        : [null, 0, 12];
      for (const height of ['none', 'slight']) {
        for (const elapsedHours of points) {
          const input = { stage:'mature', ratio:ratio.value, height, temp:temp.value, elapsedHours };
          add('time-boundary', input,
            {
              ...common,
              consistency:probe.expectedReliable ? 'consistent' : 'out_of_calibrated_model',
              dominance:'time_modifier'
            },
            probe.expectedReliable
              ? '核验 unknown/0/窗口前/边界/窗口内/窗口后语义'
              : '核验高温段停止线性估时，经过时间不能恢复失效时钟');
        }
      }
    }
  }

  // 3. pH bands are an auxiliary one-factor partition, not a Cartesian multiplier.
  for (const ph of [null, 2.4, 3.2, 3.5, 4.2, 4.6, 7.1]) {
    add('ph-boundary', { stage:'mature', ratio:'1:1:1', height:'double', temp:26, ph },
      {
        ...common,
        validity:ph != null && (ph < 2.5 || ph > 7) ? 'invalid' : 'valid',
        dominance:'modifier_only'
      }, '核验 pH 分层只补充酸化信息，不覆盖污染、活性或生食警示');
  }

  // 4. Every current exact narrative class contributes one representative.
  const core = generateReport();
  for (const group of core.equivalenceClasses) {
    const input = group.representativeInput;
    const stageOverride = input.stage !== 'mature';
    add('narrative-class', input,
      { ...common, dominance:stageOverride ? 'stage_override' : 'none' },
      `代表叙事等价类 ${group.id}（${group.scenarioCount} 个核心组合）`);
  }

  // Safety first, then boundary modifiers, then ordinary class review.
  const priority = {
    'safety-dominance':1, 'safety-missing-height':1, 'safety-negation':2, 'safety-unrelated-color':2,
    'time-boundary':3, 'ph-boundary':4, 'narrative-class':5
  };
  items.sort((a, b) => priority[a.kind] - priority[b.kind] || a.id.localeCompare(b.id));

  const byKind = {};
  const byEvidenceStatus = {};
  for (const item of items) {
    byKind[item.kind] = (byKind[item.kind] || 0) + 1;
    byEvidenceStatus[item.evidenceCoverage.status] = (byEvidenceStatus[item.evidenceCoverage.status] || 0) + 1;
  }

  return {
    schema:SCHEMA,
    generatedAt:new Date().toISOString(),
    sourceRuleEngine:'starter-doctor.browser.js',
    policy:'安全覆盖优先；语义边界代表整数枚举；少见但可能保留；证据缺口不等于不可能；完整 2,016 核心组合另见 scenarios.json。',
    summary:{ itemCount:items.length, byKind, byEvidenceStatus, coreNarrativeClassCount:core.summary.narrativeEquivalenceClassCount },
    items
  };
}

function main(argv = process.argv.slice(2)) {
  const outputIndex = argv.findIndex(arg => arg === '-o' || arg === '--output');
  const output = outputIndex >= 0 ? argv[outputIndex + 1] : '-';
  if (outputIndex >= 0 && !output) throw new Error('Output path is required after -o/--output');
  const report = buildReviewQueue();
  const text = JSON.stringify(report, null, 2) + '\n';
  if (output === '-') process.stdout.write(text);
  else {
    const target = path.resolve(output);
    fs.mkdirSync(path.dirname(target), { recursive:true });
    fs.writeFileSync(target, text, 'utf8');
    process.stdout.write(`Wrote ${report.summary.itemCount} review items to ${target}\n`);
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) { process.stderr.write(`Error: ${error.message || String(error)}\n`); process.exitCode = 1; }
}

module.exports = { SCHEMA, stableId, makeItem, buildReviewQueue, main };
