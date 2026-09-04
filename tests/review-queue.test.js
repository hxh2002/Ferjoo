#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildReviewQueue } from '../src/algorithms/build-review-queue.js';

const report = buildReviewQueue();
assert.equal(report.schema, 'dr-ferjoo/review-queue/v1');
assert.ok(report.summary.itemCount > report.summary.coreNarrativeClassCount);
assert.equal(report.items.length, report.summary.itemCount);
assert.equal(new Set(report.items.map(item => item.id)).size, report.items.length);
assert.equal(report.items[0].classification.dominance, 'safety_override');
assert.ok(report.items.every(item => item.workflow.map(step => step.step).join('|') === '核验|检索|重写'));
assert.ok(report.items.every(item => item.result.ruleTrace.length > 0));
assert.ok(report.items.every(item => item.result.evidenceRefs.length > 0));

const highTemperatureTiming = report.items.filter(item =>
  item.kind === 'time-boundary' && item.input.temp === 't_gt32'
);
assert.ok(highTemperatureTiming.length > 0);
assert.ok(highTemperatureTiming.every(item => item.result.expectedReliable === false));
assert.ok(highTemperatureTiming.every(item => /不建议估时|不提供.*估时/.test(item.result.expectedHours)));

const safetyItems = report.items.filter(item => item.classification.dominance === 'safety_override');
assert.ok(safetyItems.every(item => item.result.state === '已污染（不可使用）'));

process.stdout.write(`ok - ${report.summary.itemCount} review items; ${report.summary.coreNarrativeClassCount} core narrative classes\n`);
