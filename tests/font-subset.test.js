import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const fontsDir = new URL('../public/fonts/', import.meta.url);
const files = readdirSync(fontsDir).filter((name) => name.startsWith('fangyuan-') && name.endsWith('.woff2'));
const css = read('src/assets/fonts.css');
const tokens = read('src/assets/tokens.css');
const html = read('index.html');
const main = read('src/main.js');

assert.ok(files.includes('fangyuan-ui.woff2'), '界面字体分包存在');
assert.ok(files.some((name) => /^fangyuan-ext-\d+\.woff2$/.test(name)), '其余汉字分成按需分包');
assert.ok(statSync(new URL('fangyuan-ui.woff2', fontsDir)).size < 400 * 1024, '界面字体首包小于 400KB');
for (const name of files) {
  assert.match(css, new RegExp(`url\\("/fonts/${name}"\\) format\\("woff2"\\) tech\\(variations\\)`));
  assert.ok(statSync(new URL(name, fontsDir)).size > 1000, `${name} 不是空文件`);
}
assert.equal(css.match(/@font-face/g).length, files.length, '每个分包都有一条 @font-face');
assert.equal(css.match(/unicode-range:/g).length, files.length, '每个分包都限定 unicode-range');
assert.equal(css.match(/font-weight: 200 700/g).length, files.length, '字重轴覆盖设计里的 200 到 700');
assert.doesNotMatch(css, /\.ttf/);
assert.doesNotMatch(main, /AlimamaFangYuanTiVF/);
assert.match(tokens, /--font-sans:\s*"Alimama FangYuanTi VF"/);
assert.match(main, /import '\.\/assets\/fonts\.css'/);
assert.match(html, /rel="preload" href="\/fonts\/fangyuan-ui\.woff2"/);
assert.doesNotMatch(html, /fangyuan-ext-/);
