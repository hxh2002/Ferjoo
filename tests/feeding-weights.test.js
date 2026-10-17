#!/usr/bin/env node
import assert from 'node:assert/strict';
import { computeWeights, ratioParts, weightFields } from '../src/lib/feeding-weights.js';

assert.deepEqual(weightFields, ['starter', 'water', 'flour', 'total']);

assert.deepEqual(ratioParts('1:1:1'), { starter: 1, water: 1, flour: 1, total: 3 });
assert.deepEqual(ratioParts('1:2:2'), { starter: 1, water: 2, flour: 2, total: 5 });
assert.deepEqual(ratioParts('1:5:5'), { starter: 1, water: 5, flour: 5, total: 11 });
assert.equal(ratioParts('deep_reset'), null, '自定义比例不参与换算');
assert.equal(ratioParts(''), null);
assert.equal(ratioParts('1:0:1'), null, '零配比不可换算');
assert.equal(ratioParts('1:2'), null, '不完整比例不可换算');

// 输入老种 50g，按 1:2:2 推算其余三项与合计。
assert.deepEqual(computeWeights('1:1:1', 'starter', '50'), { starter: 50, water: 50, flour: 50, total: 150 });
assert.deepEqual(computeWeights('1:2:2', 'starter', '50'), { starter: 50, water: 100, flour: 100, total: 250 });
assert.deepEqual(computeWeights('1:2:2', 'water', '100'), { starter: 50, water: 100, flour: 100, total: 250 });
assert.deepEqual(computeWeights('1:2:2', 'flour', '100'), { starter: 50, water: 100, flour: 100, total: 250 });
assert.deepEqual(computeWeights('1:2:2', 'total', '250'), { starter: 50, water: 100, flour: 100, total: 250 });

// 合计反推时按比例拆分，保留一位小数。
assert.deepEqual(computeWeights('1:2:1', 'total', '100'), { starter: 25, water: 50, flour: 25, total: 100 });
assert.deepEqual(computeWeights('1:3:3', 'total', '70'), { starter: 10, water: 30, flour: 30, total: 70 });
assert.deepEqual(computeWeights('1:2:2', 'water', '33.3'), { starter: 16.7, water: 33.3, flour: 33.3, total: 83.3 });

assert.equal(computeWeights('1:1:1', 'starter', ''), null, '留空不换算');
assert.equal(computeWeights('1:1:1', 'starter', '0'), null, '零克重不换算');
assert.equal(computeWeights('1:1:1', 'starter', '-5'), null, '负克重不换算');
assert.equal(computeWeights('1:1:1', 'starter', 'abc'), null, '非数字不换算');
assert.equal(computeWeights('1:1:1', 'sugar', '50'), null, '未知项目不换算');
assert.equal(computeWeights('deep_reset', 'total', '250'), null, '无固定配比时不猜测');
assert.equal(computeWeights(undefined, 'total', '250'), null);

console.log('feeding weights: ratio parsing, four-field conversion, one-decimal rounding and boundary rejection OK');
