import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import { concreteColor, isConcreteColor, readConcreteColor } from '../src/lib/chart-color.js';

// 背景：iOS 的 WebKit 在 <stop> 上解析 var() 会失败，回退成初始值黑色，
// 面积填充就显示成一块黑。写进 stop-color 的必须是具体色值。
assert.equal(isConcreteColor('var(--brand-primary)'), false, 'a CSS variable needs runtime resolution');
assert.equal(isConcreteColor('env(safe-area-inset-top)'), false, 'env() is not a color stop value');
assert.equal(isConcreteColor('currentColor'), false, 'currentColor needs the cascade to resolve');
assert.equal(isConcreteColor('rgba(0, 0, 0, 0)'), false, 'fully transparent is treated as unresolved');
assert.equal(isConcreteColor(''), false, 'an empty value cannot paint anything');
assert.equal(isConcreteColor(null), false, 'null is unresolved');
assert.equal(isConcreteColor(undefined), false, 'undefined is unresolved');

assert.equal(isConcreteColor('#ff6b25'), true, 'hex colors are concrete');
assert.equal(isConcreteColor('rgb(255, 107, 37)'), true, 'rgb() is concrete');
assert.equal(isConcreteColor('  #c04b0a  '), true, 'surrounding whitespace is tolerated');

// 解算结果优先，其次是本身就是具体色的入参，两者都不可用时返回空串。
assert.equal(concreteColor('rgb(255, 107, 37)', 'var(--brand-primary)'), 'rgb(255, 107, 37)', 'the resolved color wins');
assert.equal(concreteColor('', 'var(--brand-primary)'), '', 'an unresolved variable never reaches a stop');
assert.equal(concreteColor('rgba(0, 0, 0, 0)', 'var(--x)'), '', 'a transparent resolution does not fall through to the variable');
assert.equal(concreteColor('', '#2b6cb0'), '#2b6cb0', 'a literal color can be used before mount');
assert.equal(concreteColor('var(--x)', '#2b6cb0'), '#2b6cb0', 'a variable resolution falls back to the literal input');

// readConcreteColor 只走计算样式，并且在无 DOM 环境里安全返回。
assert.equal(readConcreteColor(null), '', 'no element means no color');
assert.equal(readConcreteColor({}, {}), '', 'a view without getComputedStyle is tolerated');
assert.equal(readConcreteColor({}, { getComputedStyle: () => ({ color: 'rgb(255, 107, 37)' }) }), 'rgb(255, 107, 37)');
assert.equal(readConcreteColor({}, { getComputedStyle: () => ({ color: 'var(--brand-primary)' }) }), '', 'an unresolved computed value is rejected');
assert.equal(readConcreteColor({}, { getComputedStyle: () => { throw new Error('detached'); } }), '', 'a throwing probe is tolerated');

// 组件接线：stop 不能绑 var()，面积填充必须走 style（属性位置同样不解析变量）。
const source = readFileSync(new URL('../src/components/SeriesChart.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const template = descriptor.template.content;
assert.match(template, /:stop-color="gradientColor"/, 'stops receive the resolved color, not the raw prop');
assert.doesNotMatch(template, /:stop-color="color"/, 'the raw prop must never reach stop-color');
assert.doesNotMatch(template, /:stop-color="`[^`]*var\(/, 'stop-color must not interpolate a variable');
assert.match(template, /class="series-area"[\s\S]{0,160}:style="\{ fill:/, 'the area fill is applied through style so var() can resolve');
assert.match(template, /class="series-color-probe"/, 'a probe element carries the CSS color for resolution');

// 颜色解算只在客户端发生：SSR 阶段没有 window，不能抛错。
const script = compileScript(descriptor, { id: 'chart-color-test' });
assert.match(script.content, /onMounted\(/, 'resolution runs after mount');
assert.match(script.content, /readConcreteColor\(/, 'resolution goes through the tested helper');

console.log('chart color: unresolved variables never reach a gradient stop');
