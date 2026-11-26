import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { chartSegments, moveSampleIndex, nearestSampleIndex } from '../src/lib/chart-selection.js';
import { concreteColor, readConcreteColor } from '../src/lib/chart-color.js';

const source = readFileSync(new URL('../src/components/SeriesChart.vue', import.meta.url), 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
const script = compileScript(descriptor, { id: 'series-chart-test' });
const template = compileTemplate({ source: descriptor.template.content, filename: 'SeriesChart.vue', id: 'series-chart-test', compilerOptions: { bindingMetadata: script.bindings } });
assert.deepEqual(template.errors, []);

assert.match(source, /initialSelection: \{ type: String, default: '' \}/);
assert.match(source, /initialSelection: \{ type: String, default: '' \}/);
assert.doesNotMatch(source, /releasing|releaseTimer|@blur/, 'a persistent selection has no fading release state');
assert.match(source, /width: 48px;\s*height: 20px/);
assert.match(source, />\{\{ nowLabel \}\}</);
assert.match(source, /nowLabel: \{ type: String, default: '当前' \}/);
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
assert.match(source, /Math\.abs\(center - half\) < 1\) return \{ left: '0px', transform: 'none' \}/, 'fractional left-edge positions snap inside the card');
assert.match(source, /Math\.abs\(center - \(tipRowWidth\.value - half\)\) < 1\) return \{ left: '100%', transform: 'translateX\(-100%\)' \}/, 'fractional right-edge positions snap inside the card');
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

console.log('series chart: segments, snap, keyboard and persistent selection passed');

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
  '../lib/chart-selection.js': { chartSegments, moveSampleIndex, nearestSampleIndex },
  '../lib/chart-color.js': { concreteColor, readConcreteColor }
});
const at = (minute, v) => ({ t: new Date(Date.UTC(2026, 10, 7, 1, minute)).toISOString(), v });
// 用真实组件 + 真实 props 解析来渲染：直接调 setup() 会绕过 props 声明，color 永远是 undefined，
// 渐变颜色相关的断言就失去了意义。
const chartComponent = { ...component, render };
const { descriptor: mobileDescriptor, errors: mobileErrors } = parse(chart);
assert.deepEqual(mobileErrors, []);
const mobileScript = compileScript(mobileDescriptor, { id: 'mobile-chart-test' });
const mobileTemplate = compileTemplate({ source: mobileDescriptor.template.content, filename: 'MDraggableChart.vue', id: 'mobile-chart-test', compilerOptions: { bindingMetadata: mobileScript.bindings } });
assert.deepEqual(mobileTemplate.errors, []);
const mobileSetupCode = mobileScript.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, path) => {
  if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ': ')} = modules[${JSON.stringify(path)}];`;
  return `const ${bindings.trim()} = modules[${JSON.stringify(path)}];`;
}).replace('export default', 'return');
const mobileRenderCode = mobileTemplate.code.replace(/import \{([^}]+)\} from "vue"/, (_, bindings) => `const { ${bindings.replace(/ as /g, ': ')} } = Vue;`).replace('export function render', 'function render');
const mobileRender = new Function('Vue', `${mobileRenderCode}; return render;`)(Vue);
async function drawTip(points, selectedIndex = 0, extra = {}) {
  const selectedSeries = {
    ...chartComponent,
    setup(props, context) {
      const state = component.setup(props, context);
      state.hoverIdx.value = selectedIndex;
      return state;
    }
  };
  const mobileComponent = new Function('modules', mobileSetupCode)({ vue: Vue, '../SeriesChart.vue': selectedSeries });
  const app = Vue.createSSRApp({ render: () => Vue.h({ ...mobileComponent, render: mobileRender }, { label: '高度', unit: ' mm', points, ...extra }) });
  const html = await renderToString(app);
  return html.match(/<div[^>]*class="series-fixed-tip"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
}
async function draw(points, { selectedIndex, ...extra } = {}) {
  const selectedSeries = selectedIndex == null ? chartComponent : {
    ...chartComponent,
    setup(props, context) {
      const state = component.setup(props, context);
      state.hoverIdx.value = selectedIndex;
      return state;
    }
  };
  const app = Vue.createSSRApp({ render: () => Vue.h(selectedSeries, { label: '高度', unit: 'mm', points, interactive: true, highlight: true, sticky: true, ...extra }) });
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
// 折线和选点竖线的填充由组件自己关掉，不依赖另一份样式表。
assert.match(source, /\.series-line \{[^}]*fill:\s*none/, 'the polyline must opt out of SVG default black fill');
assert.match(source, /\.series-guide \{[^}]*fill:\s*none/, 'the vertical selection guide must not become a filled black column on mobile');
assert.match(source, /\.series-guide \{[^}]*stroke:\s*var\(--series-guide-color, rgba\(42,29,23,\.38\)\)/, 'the guide keeps its own stroke without relying on desktop CSS');
assert.match(source, /\.series-guide \{[^}]*stroke-width:\s*var\(--series-guide-width, 1px\)/, 'the guide width comes from the shared variable');
assert.match(source, /\.series-tip-stem \{[^}]*width:\s*var\(--series-guide-width, 1px\)/, 'the stem reuses the guide width so both halves match');
assert.match(source, /\.series-tip-stem \{[^}]*var\(--series-guide-color, rgba\(42,29,23,\.38\)\)/, 'the stem reuses the guide colour so both halves match');
assert.match(source, /\.series-tip-stem \{[^}]*repeating-linear-gradient\(to bottom,[\s\S]{0,90}0 2px, transparent 2px 4px\)/, 'the stem dash period matches the SVG 2 2 pattern');
assert.match(source, /\.series-tip-stem \{[^}]*transform:\s*translateX\(-50%\)/, 'the stem stays centred on the sample x');
assert.doesNotMatch(source, /\.series-tip-stem \{[^}]*border-left/, 'the stem no longer draws its own independent 1px border');
assert.match(source, /\.series-guide \{[^}]*stroke-dasharray:\s*2 2/, 'the plot guide continues the dashed stem from the tooltip');
assert.match(source, /\.series-area \{[^}]*stroke:\s*none/, 'the area fill must not inherit a stroke');
// 固定气泡行：有数据时始终预留（布局不抖动），且不再渲染纵坐标值标签 / 时间游标标签。
const fixed = await draw([at(0, 30), at(10, 35)], { fixedTip: true });
assert.match(fixed.html, /class="series-tip-row/, 'the fixed bubble row is always reserved');
assert.doesNotMatch(fixed.html, /series-value-label|series-time-label|series-guide-y/);
const oldest = await draw([at(20, 32), at(0, 30), at(10, 31)], { fixedTip: true, initialSelection: 'oldest' });
assert.match(oldest.html, /class="series-guide"[^>]*x1="5"/, 'the oldest valid sample gets a guide before any gesture');
assert.match(oldest.html, /class="series-hover-dot"[^>]*left:5%/, 'the default selected dot matches the guide');
assert.match(oldest.html, /class="series-fixed-tip"[^>]*transform:none/, 'the initial left-edge bubble is inset before DOM measurement');
assert.match(oldest.html, /<strong>30mm<\/strong><span>\d{2}:\d{2}<\/span>/, 'the bubble uses the oldest sample, not the newest sample');
const latest = await draw([at(0, 30), at(10, 35)], { fixedTip: true, initialSelection: 'oldest', selectedIndex: 1 });
assert.match(latest.html, /class="series-guide"[^>]*x1="95"/, 'the last point keeps its own guide position');
assert.match(latest.html, /class="series-fixed-tip"[^>]*transform:translateX\(-100%\)/, 'the right-edge bubble is inset before DOM measurement');
const initialEmpty = await draw([], { fixedTip: true, initialSelection: 'oldest' });
assert.doesNotMatch(initialEmpty.html, /series-guide|series-fixed-tip/, 'empty data never leaves a stale indicator');
const defaultSingle = await draw([at(0, 30)], { fixedTip: true, initialSelection: 'oldest' });
assert.match(defaultSingle.html, /class="series-guide"[^>]*x1="50"/, 'a single valid point is selected in the centre');
assert.match(defaultSingle.html, /class="series-fixed-tip"[^>]*transform:translateX\(-50%\)/, 'a single-point bubble is centred without measurement');
const initialSkippedNull = await draw([at(0, null), at(10, 31), at(20, 32)], { fixedTip: true, initialSelection: 'oldest' });
assert.match(initialSkippedNull.html, /class="series-fixed-tip"[\s\S]*?31mm/, 'the default bubble skips invalid readings');
const floating = await draw([at(0, 30), at(10, 35)]);
assert.doesNotMatch(floating.html, /series-tip-row/, 'the default chart has no reserved bubble row');

// 移动端浮层复用 SeriesChart 对 point.t 的格式化，不按数组索引或采样间隔推算时间。
const sampledAt = new Date(2026, 10, 10, 11, 7).toISOString();
const irregularTip = await drawTip([
  { t: new Date(2026, 10, 10, 0, 13).toISOString(), v: 28 },
  { t: sampledAt, v: 30.04 },
  { t: new Date(2026, 10, 10, 13, 49).toISOString(), v: 31 }
], 1);
assert.match(irregularTip, /11:07/, 'the selected sample uses its actual local sampling time');
assert.match(irregularTip, /30\.0 mm/, 'the tooltip keeps the selected value, one decimal and unit');
assert.doesNotMatch(irregularTip, /发酵|00:13|13:49/, 'no elapsed duration or another sample time appears');
const longTip = await drawTip([
  { t: new Date(2026, 10, 10, 8, 0).toISOString(), v: 20 },
  { t: new Date(2026, 10, 11, 11, 7).toISOString(), v: 30 }
], 1);
assert.match(longTip, /11\/11 11:07/, 'spans over twenty hours keep the existing month/date fallback');
assert.doesNotMatch(chart, /elapsedCaption|发酵 \$\{hours\} 小时/, 'mobile tooltips no longer derive elapsed fermentation hours');
console.log('series chart: tooltip uses the selected ISO timestamp and value');

// 散点、选中点、底部行和标题行的布局由组件自己提供。
assert.match(source, /\.series-dot, \.series-hover-dot \{[^}]*position: absolute[^}]*transform: translate\(-50%, -50%\)/, 'dots are centred on their sample without desktop CSS');
assert.match(source, /\.series-hover-dot \{ z-index: 2; \}/, 'the selected dot sits above the max / baseline tags');
assert.match(source, /\.series-range \{[^}]*display: flex[^}]*justify-content: space-between/, 'the time range stays right-aligned on every page');
assert.match(source, /\.series-headline \{[^}]*display: flex/, 'caption and value keep their gap on every page');
assert.doesNotMatch(trend, /:deep\(\.series-hover-dot\)\{position:absolute/, 'the trend page no longer carries its own copy of the dot positioning');
assert.match(trend, /\.series-grid\)\{[^}]*vector-effect:non-scaling-stroke/, 'grid lines keep 1px regardless of chart height');
assert.match(trend, /row\[key\] == null \|\| row\[key\] === '' \? null/, 'empty-string readings are gaps, not zero');
assert.match(trend, /label="湿度"[^>]*:digits="0"/);
assert.match(trend, /label="电量"[^>]*:digits="0"/);
assert.match(detail, /label="湿度"[^>]*:digits="0"/);

// 标题值、min/max 标签与气泡同一精度：膨胀倍数两位小数，百分比取整。
async function drawMobile(points, extra = {}) {
  const mobileComponent = new Function('modules', mobileSetupCode)({ vue: Vue, '../SeriesChart.vue': chartComponent });
  const app = Vue.createSSRApp({ render: () => Vue.h({ ...mobileComponent, render: mobileRender }, { label: '膨胀倍数', points, ...extra }) });
  return renderToString(app);
}
const expansionHtml = await drawMobile([at(0, 0.93), at(10, 1.42), at(20, 0.851)], { digits: 2 });
assert.match(expansionHtml, /max 1\.42</, 'max keeps two decimals');
assert.match(expansionHtml, /min 0\.85</, 'min keeps two decimals');
assert.match(expansionHtml, /class="series-value"[^>]*>0\.85</, 'the headline falls back to the latest value with the same precision');
const percentHtml = await drawMobile([at(0, 100), at(10, null), at(20, 76.5)], { label: '湿度', unit: '%', digits: 0 });
assert.match(percentHtml, /max 100%</);
assert.match(percentHtml, /min 77%</);
assert.doesNotMatch(percentHtml, /100\.0%/, 'integer percentages never show a trailing .0');
const captioned = await drawMobile([at(0, 0.93), at(10, 1.42)], { digits: 2, valueText: '1.42', caption: '最高' });
assert.match(captioned, /class="series-value"[^>]*>1\.42</, 'an explicit valueText still wins');
const emptyMobile = await drawMobile([at(0, null)], { digits: 2 });
assert.match(emptyMobile, /暂无可绘制的数据/);
assert.doesNotMatch(emptyMobile, /Infinity|NaN/, 'empty data never formats ±Infinity');
console.log('series chart: mobile labels share precision and layout without desktop CSS');

// 「当前 / 最新」：趋势页今天显示当前，历史日期显示最新，标题与图内小字同步。
assert.match(trend, /latestLabel = computed\(\(\) => \(isToday\.value \? '当前' : '最新'\)\)/);
assert.equal((trend.match(/:caption="latestLabel" :now-label="latestLabel"/g) || []).length, 4, 'all four trend charts follow the selected day');
assert.doesNotMatch(trend, /caption="当前"/);
assert.match(await drawMobile([at(0, 30), at(10, 31)], { label: '高度', nowLabel: '最新' }), /class="series-now"[^>]*>最新</);
assert.match(await drawMobile([at(0, 30), at(10, 31)], { label: '高度' }), /class="series-now"[^>]*>当前</, 'other callers keep 当前');

// 读屏：可见气泡行不再是 live region，播报交给单独的隐藏节点。
assert.doesNotMatch(source, /class="series-tip-row"[^>]*aria-live/, 'the visible bubble row no longer announces every frame');
assert.match(source, /class="series-sr-live" aria-live="polite" aria-atomic="true"/);
const nonInteractive = await draw([at(0, 30)], { interactive: false, sticky: false });
assert.doesNotMatch(nonInteractive.html, /series-sr-live/, 'static charts have no live region');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function announcer(extra = {}) {
  const defaults = Object.fromEntries(Object.entries(component.props).map(([key, def]) => [key, typeof def.default === 'function' && def.type !== Function ? def.default() : def.default]));
  const props = Vue.reactive({ ...defaults, label: '高度', unit: 'mm', points: [at(0, 30), at(10, 31), at(20, 32)], sticky: true, fixedTip: true, initialSelection: 'oldest', ...extra });
  const warn = console.warn;
  console.warn = () => {};
  try {
    return Vue.effectScope().run(() => component.setup(props, { emit() {}, expose() {} }));
  } finally { console.warn = warn; }
}
const target = { getBoundingClientRect: () => ({ left: 0, width: 100 }), setPointerCapture() {} };
const live = await announcer();
assert.equal(live.liveText.value, '', 'nothing is announced synchronously');
await wait(350);
assert.match(live.liveText.value, /^高度 \d{2}:\d{2} 30mm$/, 'the default oldest selection is announced once with its label');
live.onPointerDown({ currentTarget: target, clientX: 50, pointerId: 1 });
await wait(10);
live.onPointerMove({ currentTarget: target, clientX: 95, buttons: 1 });
await wait(350);
assert.match(live.liveText.value, /30mm$/, 'dragging never rewrites the announcement');
live.onPointerUp();
await wait(350);
assert.match(live.liveText.value, /32mm$/, 'releasing announces the settled sample once');
live.onKey({ key: 'ArrowLeft', preventDefault() {} });
live.onKey({ key: 'ArrowLeft', preventDefault() {} });
await wait(100);
assert.match(live.liveText.value, /32mm$/, 'rapid key presses are debounced');
await wait(300);
assert.match(live.liveText.value, /30mm$/, 'the announcement follows the final keyboard selection');
const formatted = await announcer({ announceValue: (point) => `${point.v.toFixed(2)}x` });
await wait(350);
assert.match(formatted.liveText.value, /30\.00x$/, 'callers can match the bubble precision');
assert.match(chart, /:announce-value="announceValue"/, 'the mobile chart announces with its tooltip precision');
console.log('series chart: live region announces settled selections only; trend shows 最新 for past days');

console.log('series chart: empty/single/flat/duplicate/tiny-span geometry stays finite');
