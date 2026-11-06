import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { CHART_RELEASE_MS, chartSegments, moveSampleIndex, nearestSampleIndex } from '../src/lib/chart-selection.js';

const source = readFileSync(new URL('../src/components/SeriesChart.vue', import.meta.url), 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
const script = compileScript(descriptor, { id: 'series-chart-test' });
const template = compileTemplate({ source: descriptor.template.content, filename: 'SeriesChart.vue', id: 'series-chart-test', compilerOptions: { bindingMetadata: script.bindings } });
assert.deepEqual(template.errors, []);

assert.equal(CHART_RELEASE_MS, 1200);
assert.match(source, /CHART_RELEASE_MS/);
assert.match(source, /releasing\.value = true/);
assert.match(source, /is-releasing/);
assert.match(source, /width: 48px;\s*height: 20px/);
assert.match(source, />当前</);
assert.match(source, /chartSegments\(/);

const trend = readFileSync(new URL('../src/views/mobile/MobileTrend.vue', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/views/mobile/MobileRecordDetail.vue', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../src/assets/mobile.css', import.meta.url), 'utf8');
const chart = readFileSync(new URL('../src/components/mobile/MDraggableChart.vue', import.meta.url), 'utf8');
assert.doesNotMatch(trend, /series-tip[\s\S]*white-space:\s*nowrap/);
assert.match(detail, /:height="200"/);
assert.match(detail, /:height="126"/);
assert.match(detail, /var\(--m-chart-height,126px\)/);
assert.match(chart, /width: 104px/);
assert.match(chart, /min-height: 38px/);
assert.match(chart, /white-space: normal/);
assert.match(mobileCss, /body\.mobile-mode \.m-draggable-chart \.series-tip \{[^}]*width: 104px/);

const t = (minutes, v) => ({ t: new Date(Date.UTC(2026, 10, 6, 0, minutes)).toISOString(), v });
const broken = chartSegments([t(0, 10), t(10, null), t(20, 30)]);
assert.equal(broken.length, 2, 'a null sample breaks the line');
assert.deepEqual(broken[0].map((point) => point.v), [10]);
assert.deepEqual(broken[1].map((point) => point.v), [30]);

const gapped = chartSegments([t(0, 10), t(31, 12)]);
assert.equal(gapped.length, 2, 'a gap longer than 30 minutes breaks the line');
const joined = chartSegments([t(0, 10), t(30, 12)]);
assert.equal(joined.length, 1, 'a 30 minute gap still belongs to one segment');

const samples = [{ x: 0, v: 1 }, { x: 10, v: null }, { x: 20, v: 3 }];
assert.equal(nearestSampleIndex(samples, 0.45), 0, 'drag snaps to a finite sample');
assert.equal(nearestSampleIndex(samples, 0.55), 2, 'null samples are not snap targets');
assert.equal(moveSampleIndex(null, samples.length, 'ArrowRight'), 0, 'the first arrow from an empty selection lands on the first point');
assert.equal(moveSampleIndex(0, samples.length, 'ArrowRight'), 1);
assert.equal(moveSampleIndex(0, samples.length, 'ArrowLeft'), 0);
assert.equal(moveSampleIndex(2, samples.length, 'ArrowRight'), 2);

console.log('series chart: segments, snap, keyboard and 1.2s release passed');
