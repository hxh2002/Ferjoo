#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

for (const id of ['stageChoices','ratioChoices','heightChoices','tempToggle','tempRange','elapsedToggle','resultContent','howModal','aboutModal']) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing v0.2 UI anchor ${id}`);
}
for (const cls of ['choice-grid','height-grid','result-panel','modal-backdrop','brand-lockup']) {
  assert.match(css, new RegExp(`\\.${cls}\\b`), `missing v0.2 CSS signature ${cls}`);
}
assert.match(app, /bindChoice\('stageChoices','stage'\)/);
assert.match(app, /bindChoice\('heightChoices','height'\)/);
assert.doesNotMatch(html, /id=["']stage["']/);
assert.doesNotMatch(html, /id=["']diagnose["']/);

console.log('ok 1 - v0.2 UI architecture retained');
console.log('\n1/1 UI baseline tests passed.');
