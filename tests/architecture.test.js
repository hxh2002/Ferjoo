#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const scenarioCatalog = JSON.parse(
  fs.readFileSync(path.join(src, 'algorithms', 'scenario-catalog.json'), 'utf8')
);
assert.equal(scenarioCatalog.scenarios.length, 2016, 'scenario catalog must keep all 2,016 combinations');

const registry = JSON.parse(
  fs.readFileSync(path.join(src, 'references', 'evidence-registry.json'), 'utf8')
);
assert.ok(registry.cards.length >= 30, 'complete evidence registry must remain in references');

const allSource = walk(src).filter((file) => /\.(js|vue)$/.test(file));
for (const file of allSource) {
  const rel = path.relative(root, file).replaceAll(path.sep, '/');
  const text = fs.readFileSync(file, 'utf8');

  if (!rel.startsWith('src/algorithms/') && !rel.startsWith('src/references/')) {
    const algorithmImports = [...text.matchAll(/from\s+['"]([^'"]*algorithms\/[^'"]+)['"]/g)].map((m) => m[1]);
    if (algorithmImports.length) {
      assert.equal(
        rel,
        'src/services/diagnosis.service.js',
        `${rel} must not call algorithms directly`
      );
      assert.deepEqual(
        algorithmImports,
        ['../algorithms/index.js'],
        'diagnosis service may only call the algorithms public barrel'
      );
    }

    const referenceImports = [...text.matchAll(/from\s+['"]([^'"]*references\/[^'"]+)['"]/g)];
    assert.equal(referenceImports.length, 0, `${rel} must not call references directly`);
  }
}

const diagnosis = fs.readFileSync(path.join(src, 'algorithms', 'diagnosis.js'), 'utf8');
assert.match(diagnosis, /from '\.\.\/references\/index\.js'/);
assert.doesNotMatch(diagnosis, /runtime-catalog\.js/);

for (const legacy of ['starter-doctor.js', 'starter-doctor.browser.js', 'app.js', 'styles.css', 'research', 'reports', 'scripts']) {
  assert.equal(fs.existsSync(path.join(root, legacy)), false, `legacy path should be removed: ${legacy}`);
}

const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '001_initial.sql'), 'utf8');
assert.match(migration, /system_user_id/);
assert.match(migration, /date_bin\(\s*interval '10 minutes'/);
assert.match(migration, /enable row level security/);
assert.match(migration, /private\.set_user_role/);

console.log('ok 1 - architecture boundaries, 2,016 catalog, references, and Supabase schema are intact');
