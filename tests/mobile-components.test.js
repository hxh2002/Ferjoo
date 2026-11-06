import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { calendarGrid, calendarMonth, calendarTitle, calendarWeek, shiftCalendarMonth } from '../src/lib/mobile-calendar.js';
import { nearestSampleIndex } from '../src/lib/chart-selection.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function compile(file) {
  const source = read(file);
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, [], file);
  const script = compileScript(descriptor, { id: file });
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, [], file);
  return source;
}

const record = compile('src/components/mobile/MRecordCard.vue');
assert.match(record, /min-height: 64px/);
assert.match(record, /--m-icon-disc-size': `\$\{size\}px`|size="36"|:size="36"/);
assert.match(record, /width: 18px/);
assert.match(record, /var\(--motion-expand\)/);
assert.match(record, /aria-expanded/);

const radio = compile('src/components/mobile/MRadioCard.vue');
assert.match(radio, /min-height: 56px/);
assert.match(radio, /var\(--brand-action\)/);
assert.match(radio, /var\(--surface-selected\)/);
assert.match(radio, /type="radio"/);

const sheet = compile('src/components/mobile/MSheet.vue');
assert.match(sheet, /border-radius: var\(--m-radius-sheet\) var\(--m-radius-sheet\) 0 0/);
assert.match(sheet, /:focus-visible/);
assert.match(sheet, /width: 36px;\s*height: 4px/);
assert.match(sheet, /rgba\(48,\s*37,\s*31,\s*\.25\)/);
assert.match(sheet, /role="dialog"/);
assert.match(sheet, /aria-modal="true"/);

const action = compile('src/components/mobile/MActionSheet.vue');
assert.match(action, /min-height: 56px/);
assert.match(action, /var\(--danger-text\)/);
assert.match(action, /var\(--danger-bg\)/);

const wheel = compile('src/components/mobile/MWheelPicker.vue');
assert.match(wheel, /height: 210px/);
assert.match(wheel, /--m-wheel-row-height: 42px/);
assert.match(wheel, /role="listbox"/);
assert.match(wheel, /ArrowDown/);

const calendar = compile('src/components/mobile/MCalendar.vue');
assert.match(calendar, /height: 36px/);
assert.match(calendar, /var\(--brand-light\)/);
assert.match(calendar, /aria-pressed/);

const toast = compile('src/components/mobile/MToast.vue');
assert.match(toast, /width: min\(280px/);
assert.match(toast, /border-radius: var\(--m-radius-toast\)/);
assert.match(toast, /duration: \{ type: Number, default: 2600 \}/);
assert.match(toast, /is-success/);
assert.match(toast, /is-error/);
assert.match(toast, /is-neutral/);

const confirm = compile('src/components/mobile/MConfirmDialog.vue');
assert.match(confirm, /width: min\(327px, 100%\)/);
assert.match(confirm, /border-radius: var\(--m-radius-sheet\)/);
assert.match(confirm, /font-size: var\(--m-text-confirm\)/);
assert.match(confirm, /min-height: 44px/);
assert.match(confirm, /border-radius: var\(--m-radius-confirm\)/);
assert.match(confirm, /is-danger/);

const chart = compile('src/components/mobile/MDraggableChart.vue');
assert.match(chart, /interactive: \{ type: Boolean, default: true \}/);
assert.match(chart, /bubble: \{ type: Boolean, default: true \}/);
assert.match(chart, /highlight: \{ type: Boolean, default: true \}/);
assert.match(chart, /:sticky="sticky"/);
assert.match(chart, /width: 104px/);
assert.match(chart, /11px/);
const series = compile('src/components/SeriesChart.vue');
assert.match(series, /series-value-label/);
assert.match(series, /interactive: \{ type: Boolean, default: false \}/);
assert.match(series, /bubble: \{ type: Boolean, default: true \}/);
assert.match(series, /highlight: \{ type: Boolean, default: false \}/);
assert.match(series, /v-if="highlight && hoverPoint"/);
assert.match(series, /v-if="bubble && hoverPoint"/);
compile('src/components/mobile/MIconDisc.vue');
compile('src/views/mobile/MobileFeeding.vue');

const tokens = read('src/assets/tokens.css');
const mobile = read('src/assets/mobile.css');
assert.match(tokens, /--border-warm: #eaddd2/);
assert.match(mobile, /--text-lg: 18px/);
assert.match(mobile, /--text-md: 16px/);
assert.match(mobile, /--border-default: var\(--border-warm\)/);
assert.match(mobile, /--m-radius-sheet: 24px/);
assert.match(mobile, /--m-radius-confirm: 22px/);
assert.match(mobile, /--m-radius-toast: 18px/);
assert.match(mobile, /--m-radius-bubble: 8px/);
assert.match(mobile, /--m-text-confirm: 20px/);
assert.match(mobile, /font-weight: 500/);
assert.doesNotMatch(mobile, /#285DA8|#84310B/);

assert.equal(calendarMonth('2026-11-06'), '2026-11');
assert.equal(calendarTitle('2026-11'), '2026 年 11 月');
const week = calendarWeek('2026-11-06', { today: '2026-11-06', max: '2026-11-06' });
assert.equal(week.length, 7);
assert.equal(week[0].date, '2026-11-02');
assert.equal(week[4].selected, true);
assert.equal(week[5].disabled, true);
assert.equal(calendarGrid('2026-11', { today: '2026-11-06', max: '2026-11-06' }).length, 42);
assert.equal(shiftCalendarMonth('2026-11', 1, '2026-01', '2026-11'), '2026-11');

const samples = [{ x: 0, v: 1 }, { x: 10, v: null }, { x: 20, v: 3 }];
assert.equal(nearestSampleIndex(samples, 0.2), 0);
assert.equal(nearestSampleIndex(samples, 0.9), 2);
assert.equal(nearestSampleIndex([], 0.5), null);

const bannedPaint = /#(?:FF6B25|FFB05A|FFF9F3)\b|border-radius:\s*999px/i;
function assertNoBannedPaint(dir) {
  for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) assertNoBannedPaint(rel);
    else if (entry.name.endsWith('.vue')) assert.doesNotMatch(read(rel), bannedPaint, rel);
  }
}
assertNoBannedPaint('src/components/mobile');
assertNoBannedPaint('src/views/mobile');
assert.doesNotMatch(read('src/components/SeriesChart.vue'), bannedPaint, 'src/components/SeriesChart.vue');

console.log('mobile components: foundation contracts, calendar bounds and chart snapping passed');
