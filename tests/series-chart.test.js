import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { CHART_RELEASE_MS, chartSegments, moveSampleIndex, nearestSampleIndex } from '../src/lib/chart-selection.js';
import { concreteColor, readConcreteColor } from '../src/lib/chart-color.js';

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
assert.match(source, /interactive: \{ type: Boolean, default: false \}/);
assert.match(source, /bubble: \{ type: Boolean, default: true \}/);
assert.match(source, /highlight: \{ type: Boolean, default: false \}/);
assert.match(source, /v-if="highlight && hoverPoint && !fixedTip"/);
assert.match(source, /v-if="bubble && hoverPoint && !fixedTip"/);
assert.match(source, /fixedTip: \{ type: Boolean, default: false \}/, 'desktop keeps the floating tip unless fixedTip is requested');
// 固定气泡行：高度写死，气泡只水平移动并做边界夹紧，竖线从气泡底部接到绘图区。
assert.match(source, /\.series-tip-row \{[^}]*height: 36px/);
assert.match(source, /\.series-fixed-tip \{[^}]*top: 0/);
assert.match(source, /\.series-tip-stem \{[^}]*top: 28px/);
assert.match(source, /Math\.min\(Math\.max\(x, half\)/, 'bubble centre is clamped inside the row');
assert.match(source, /chartSegments\(/);

const trend = readFileSync(new URL('../src/views/mobile/MobileTrend.vue', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/views/mobile/MobileRecordDetail.vue', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../src/assets/mobile.css', import.meta.url), 'utf8');
const chart = readFileSync(new URL('../src/components/mobile/MDraggableChart.vue', import.meta.url), 'utf8');
assert.doesNotMatch(trend, /series-tip[\s\S]*white-space:\s*nowrap/);
assert.match(detail, /:height="200"/);
assert.match(detail, /:height="126"/);
assert.match(detail, /var\(--m-chart-height,126px\)/);
assert.match(detail, /<section v-if="record" class="round-curves" aria-label="本轮曲线">/);
assert.match(detail, /<h2 class="curve-title">本轮曲线<\/h2>/);
assert.match(detail, /curveText\.emptyMessage/);
assert.match(readFileSync(new URL('../src/lib/record-detail.js', import.meta.url), 'utf8'), /本轮发酵时间窗内没有有效设备采样/);
assert.match(detail, /deviceTrendTarget/);
assert.match(detail, /v-if="curveText\.hint"/);
assert.equal((detail.match(/class="window-hint"/g) || []).length, 1, 'the window hint is rendered once');
assert.match(detail, /结束原因：\{\{ endReasonText \}\}/);
assert.match(chart, /:interactive="interactive"/);
assert.match(chart, /:bubble="bubble"/);
assert.match(chart, /:highlight="highlight"/);
assert.match(chart, /:fixed-tip="fixedTip"/);
assert.match(chart, /fixedTip: \{ type: Boolean, default: true \}/);
assert.doesNotMatch(mobileCss, /\.m-draggable-chart \.series-tip/, 'the old floating three-field bubble styles are gone');

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

// --- 边界回归：空数据 / 单点 / 平线 / 重复时间戳 / 极短跨度都不能产出 NaN 坐标 ---
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
const setupCode = script.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, path) => {
  if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ': ')} = modules[${JSON.stringify(path)}];`;
  return `const ${bindings.trim()} = modules[${JSON.stringify(path)}];`;
}).replace('export default', 'return');
const renderCode = template.code.replace(/import \{([^}]+)\} from "vue"/, (_, bindings) => `const { ${bindings.replace(/ as /g, ': ')} } = Vue;`).replace('export function render', 'function render');
const render = new Function('Vue', `${renderCode}; return render;`)(Vue);
const component = new Function('modules', setupCode)({
  vue: { ...Vue, useId: () => 'gradient-1' },
  '../lib/chart-selection.js': { CHART_RELEASE_MS, chartSegments, moveSampleIndex, nearestSampleIndex },
  '../lib/chart-color.js': { concreteColor, readConcreteColor }
});
const at = (minute, v) => ({ t: new Date(Date.UTC(2026, 10, 7, 1, minute)).toISOString(), v });
// 用真实组件 + 真实 props 解析来渲染：直接调 setup() 会绕过 props 声明，color 永远是 undefined，
// 渐变颜色相关的断言就失去了意义。
const chartComponent = { ...component, render };
async function draw(points, extra = {}) {
  const app = Vue.createSSRApp({ render: () => Vue.h(chartComponent, { label: '高度', unit: 'mm', points, interactive: true, highlight: true, sticky: true, ...extra }) });
  const html = await renderToString(app);
  const paths = [...html.matchAll(/<path[^>]*class="series-(line|area)"[^>]*d="([^"]*)"/g)];
  return {
    html,
    paths: paths.map((match) => match[2]),
    linePaths: paths.filter((match) => match[1] === 'line').map((match) => match[2])
  };
}
// 平线：max === min 时 span 为 0，必须落在画布中线而不是除零。
const flat = await draw([at(0, 30), at(10, 30), at(20, 30)]);
assert.equal(flat.linePaths.length, 1, 'a flat series still draws a line');
assert.equal(flat.paths.length, 2, 'the flat series also keeps its area fill');
assert.deepEqual([...new Set(flat.linePaths[0].match(/[\d.]+/g).filter((_, i) => i % 2 === 1))], ['22'], 'a flat line sits on the vertical centre');
// 单点：无法连成线，必须补一个散点，不能让整段消失。
const single = await draw([at(0, 30)]);
assert.equal(single.paths.length, 0, 'a single sample has no line');
assert.match(single.html, /series-dot/, 'a single sample is rendered as an isolated dot');
assert.doesNotMatch(single.html, /series-empty/, 'one valid sample is not an empty chart');
// 重复时间戳：同一 recorded_at 只保留一条，不能连出竖直尖峰。
const duplicated = await draw([at(0, 30), at(0, 31), at(0, null), at(10, 35)]);
assert.equal(duplicated.linePaths.length, 1, 'duplicate timestamps collapse into one point per x');
assert.match(duplicated.linePaths[0], /^M5,/, 'the first point starts at the left padding');
// 极短跨度：10ms 内的两点也要铺满横轴，而不是挤成一个点。
const tight = await draw([{ t: '2026-11-07T01:00:00.000Z', v: 30 }, { t: '2026-11-07T01:00:00.010Z', v: 31 }]);
assert.match(tight.linePaths[0], /^M5,[\d.]+ L95,[\d.]+$/, 'a sub-second span still uses the full width');
// 乱序输入：先排序再画，横坐标必须单调递增。
const unordered = await draw([at(20, 32), at(0, 30), at(10, 31)]);
const xs = unordered.linePaths[0].match(/[\d.]+/g).filter((_, i) => i % 2 === 0).map(Number);
assert.deepEqual(xs, [...xs].sort((a, b) => a - b), 'unordered samples are sorted before drawing');
// 空数据 / 全是空值 / 非法时间戳：走空态文案，不能产出 NaN 路径。
for (const points of [[], [at(0, null)], [{ t: 'nope', v: 1 }, { t: null, v: 2 }]]) {
  const empty = await draw(points);
  assert.equal(empty.paths.length, 0);
  assert.match(empty.html, /暂无可绘制的数据/);
}
for (const points of [flat, single, duplicated, tight, unordered]) {
  assert.ok(points.paths.every((d) => !/NaN|Infinity|undefined/.test(d)), 'chart geometry never emits NaN');
}
// 面积渐变必须走 style 而不是 SVG 表现属性：stop-color 是表现属性，不解析 var()，
// 传 var(--brand-primary) 会被当成无效颜色而回退成黑色，曲线下方就出现一块黑。
const gradient = await draw([at(0, 30), at(10, 35)], { color: 'var(--brand-primary)' });
assert.doesNotMatch(gradient.html, /stop-color="var\(|stop-color:\s*var\(/, 'gradient stops never receive unresolved CSS variables');
assert.match(gradient.html, /class="series-area"/, 'the area keeps its own segment closure');

// 折线是开放路径：没有 fill:none 时 SVG 会用默认黑色填充，陡峭段直接被填成黑楔形。
// 移动端不加载 main.css，所以这条必须由组件自己的样式保证。
assert.match(source, /\.series-line \{[^}]*fill:\s*none/, 'the polyline must opt out of SVG default black fill');
assert.match(source, /\.series-area \{[^}]*stroke:\s*none/, 'the area fill must not inherit a stroke');
// 固定气泡行：有数据时始终预留（布局不抖动），且不再渲染纵坐标值标签 / 时间游标标签。
const fixed = await draw([at(0, 30), at(10, 35)], { fixedTip: true });
assert.match(fixed.html, /class="series-tip-row/, 'the fixed bubble row is always reserved');
assert.doesNotMatch(fixed.html, /series-value-label|series-time-label|series-guide-y/);
const floating = await draw([at(0, 30), at(10, 35)]);
assert.doesNotMatch(floating.html, /series-tip-row/, 'the default chart has no reserved bubble row');
console.log('series chart: empty/single/flat/duplicate/tiny-span geometry stays finite');
