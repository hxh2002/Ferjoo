import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit = '0a8d43b1805553bd6783651243afe4a3451168de';
const base = `https://raw.githubusercontent.com/hxh2002/Ferjoo/${commit}/assets`;

const assets = [
  ['bg2.png', `${base}/bg2.png`],
  ['logo-brand.png', `${base}/logo-brand.png`],
  ['logo-df-cn.png', `${base}/logo-df-cn.png`],
  ['logo-df-en.png', `${base}/logo-df-en.png`]
];

const outDir = resolve(root, 'public', 'assets');
await mkdir(outDir, { recursive: true });

for (const [name, url] of assets) {
  const out = resolve(outDir, name);
  try {
    await access(out, constants.R_OK);
    console.log(`[classic-assets] keep ${name}`);
    continue;
  } catch {}

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${name}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1000) {
    throw new Error(`Downloaded ${name} is unexpectedly small (${bytes.length} bytes)`);
  }
  await writeFile(out, bytes);
  console.log(`[classic-assets] fetched ${name} (${bytes.length} bytes)`);
}
