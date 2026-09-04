#!/usr/bin/env node
// Dr. Ferjoo「翻倍时间预测」改造验收测试。
// 覆盖：人工字段解耦、非线性温度响应、高度在线校正、负证据、
//       强观测优先级、高温外推边界、温度历史积分与传感器 crossing。

import assert from 'node:assert/strict';
import * as D from '../src/algorithms/index.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('人工字段不能改变 timing（stage/smell/color/pH/notes 全部解耦）', () => {
  const physical = { stage: 'mature', ratio: '1:1:1', height: 'near', temp: 26, elapsedHours: 4 };
  const a = D.diagnoseStarter({ ...physical, smell: '', color: '', ph: '', notes: '' });
  const b = D.diagnoseStarter({
    ...physical,
    stage: 'start_d1',
    smell: '霉味',
    color: '粉红',
    ph: 5.5,
    notes: '任意人工描述'
  });
  assert.deepEqual(a.timing, b.timing);
});

test('温度不再“越热越快”：26–28℃ 附近最快，32℃ 以上明显变慢', () => {
  const p26 = D.predictDoublingTime({ ratio: '1:1:1', temp: 26 });
  const p28 = D.predictDoublingTime({ ratio: '1:1:1', temp: 28 });
  const p30 = D.predictDoublingTime({ ratio: '1:1:1', temp: 30 });
  const p32 = D.predictDoublingTime({ ratio: '1:1:1', temp: 32 });
  assert.ok(Math.abs(p26.totalHours - p28.totalHours) < 1);
  assert.ok(p30.totalHours >= p28.totalHours);
  assert.ok(p32.totalHours > p30.totalHours);
});

test('同样 4 小时，near 必须比 slight 更快（总时长更短）', () => {
  const slight = D.predictDoublingTime({ ratio: '1:1:1', temp: 26, height: 'slight', elapsedHours: 4 });
  const near = D.predictDoublingTime({ ratio: '1:1:1', temp: 26, height: 'near', elapsedHours: 4 });
  assert.ok(near.totalHours < slight.totalHours);
});

test('已经很晚但完全不涨，应把预测往后推', () => {
  const early = D.predictDoublingTime({ ratio: '1:1:1', temp: 26, height: 'none', elapsedHours: 2 });
  const late = D.predictDoublingTime({ ratio: '1:1:1', temp: 26, height: 'none', elapsedHours: 8 });
  assert.ok(late.totalHours > early.totalHours);
  assert.ok(late.totalHours > 8);
});

test('double 直接成为强观测：观测优先于比例先验', () => {
  const result = D.predictDoublingTime({ ratio: '1:5:5', temp: 26, height: 'double', elapsedHours: 9 });
  assert.equal(result.remainingHours, 0);
  assert.ok(Math.abs(result.totalHours - 9) < 0.01);
  assert.equal(result.status, 'crossed');
  assert.equal(result.basis, 'observed-double');
});

test('高温不能继续给“更快”结论：34℃ 低置信，35℃ 停止精确外推', () => {
  const at34 = D.predictDoublingTime({ ratio: '1:1:1', temp: 34 });
  assert.equal(at34.confidence, 'low');
  const at35 = D.predictDoublingTime({ ratio: '1:1:1', temp: 35 });
  assert.equal(at35.status, 'temperature-out-of-domain');
  assert.equal(at35.totalHours, null);
});

test('温度历史积分：含低温段的序列累计生物小时更少', () => {
  const seriesA = [{ tHours: 0, tempC: 26 }, { tHours: 5, tempC: 26 }];
  const seriesB = [{ tHours: 0, tempC: 26 }, { tHours: 3, tempC: 26 }, { tHours: 5, tempC: 20 }];
  assert.ok(D.integrateTemperatureSeries(seriesB) < D.integrateTemperatureSeries(seriesA));
});

test('传感器 crossing 直接得到真实翻倍时刻', () => {
  const result = D.predictDoublingTime({
    ratio: '1:1:1',
    temperatureSeries: [{ tHours: 0, tempC: 26 }, { tHours: 4, tempC: 26 }, { tHours: 5, tempC: 26 }],
    heightSeries: [{ tHours: 0, ratio: 1.0 }, { tHours: 4, ratio: 1.8 }, { tHours: 5, ratio: 2.2 }]
  });
  assert.equal(result.status, 'crossed');
  assert.equal(result.basis, 'sensor-crossing');
  assert.equal(result.confidence, 'high');
  assert.ok(result.totalHours > 4);
  assert.ok(result.totalHours < 5);
});

test('peak_plus / over3 返回“已在 elapsed 以内翻倍”，不伪造具体 crossing', () => {
  const r = D.predictDoublingTime({ ratio: '1:1:1', temp: 26, height: 'peak_plus', elapsedHours: 6 });
  assert.equal(r.status, 'crossed-before-now');
  assert.equal(r.totalHours, null);
  assert.equal(r.highHours, 6);
});

test('fallen 单点不伪造第一次翻倍时刻', () => {
  const r = D.predictDoublingTime({ ratio: '1:1:1', temp: 26, height: 'fallen', elapsedHours: 8 });
  assert.equal(r.status, 'trajectory-insufficient');
  assert.equal(r.totalHours, null);
});

test('预测器是纯函数且导出的函数齐全', () => {
  const args = { ratio: '1:1:1', temp: 26, height: 'near', elapsedHours: 4 };
  assert.deepEqual(D.predictDoublingTime(args), D.predictDoublingTime(args));
  for (const name of ['rawPaperYeastRate', 'getTemperatureResponse', 'integrateTemperatureSeries', 'detectFirstDoubleCrossing', 'predictDoublingTime']) {
    assert.equal(typeof D[name], 'function', name);
  }
});

test('diagnoseStarter 暴露 timing 并派生旧字段、引入 GANZLE-1998 证据', () => {
  const r = D.diagnoseStarter({ stage: 'mature', ratio: '1:1:1', height: 'near', temp: 26, elapsedHours: 4 });
  assert.ok(r.timing);
  assert.equal(r.expectedHours, r.timing.display);
  assert.equal(r.expectedMin, r.timing.lowHours);
  assert.equal(r.expectedMax, r.timing.highHours);
  assert.ok(r.evidenceRefs.includes('GANZLE-1998'));
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
process.stdout.write(`\n${passed}/${tests.length} doubling predictor tests passed.\n`);
