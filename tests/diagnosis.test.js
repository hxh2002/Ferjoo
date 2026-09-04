import assert from 'node:assert/strict';
import { diagnoseStarter, parseStarterInput, predictDoublingTime } from '../src/algorithms/index.js';

const parsed = parseStarterInput('成熟酵种，1:2:2，26°C，喂养后 4 小时，接近翻倍，pH 3.8');
assert.equal(parsed.stage, 'mature');
assert.equal(parsed.ratio, '1:2:2');
assert.equal(parsed.height, 'near');
assert.equal(parsed.tempC, 26);
assert.equal(parsed.elapsedHours, 4);
assert.equal(parsed.ph, 3.8);

const normal = diagnoseStarter(parsed);
assert.ok(normal.title);
assert.ok(Array.isArray(normal.actions));
assert.ok(normal.citations.length >= 1);

const contaminated = diagnoseStarter({
  stage: 'mature', ratio: '1:1:1', height: 'double', tempC: 26,
  color: 'suspicious'
});
assert.equal(contaminated.status, 'discard');

const remaining = predictDoublingTime({
  ratio: '1:2:2', tempC: 26, height: 'slight', elapsedHours: 2
});
assert.equal(remaining.status, 'remaining');
assert.match(remaining.display, /剩余约/);

const hot = predictDoublingTime({
  ratio: '1:2:2', tempC: 35, height: 'slight', elapsedHours: 2
});
assert.equal(hot.reliable, false);

console.log('Diagnosis tests OK.');
