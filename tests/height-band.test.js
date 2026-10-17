import assert from 'node:assert/strict';
import { heightBand, HEIGHT_BANDS } from '../src/lib/height-band.js';

// 基线 100 mm，按倍率区间给出默认涨幅选项。
const band = (current) => heightBand(100, current)?.value;

assert.equal(band(100), 'none');
assert.equal(band(110), 'none', '10% 以内仍视为几乎没涨');
assert.equal(band(111), 'slight');
assert.equal(band(174), 'slight');
assert.equal(band(175), 'near', '达到 1.75 倍进入接近翻倍区间');
assert.equal(band(199), 'near');
assert.equal(band(200), 'double', '达到 2 倍进入约 2 倍区间');
assert.equal(band(300), 'double', '恰好 3 倍仍属于约 2 倍区间');
assert.equal(band(301), 'over3', '超过 3 倍才进入超过 3 倍区间');

const result = heightBand(20, 45);
assert.equal(result.value, 'double');
assert.equal(result.ratio, 2.25);
assert.equal(result.expansionPercent, 125);
assert.equal(result.range, '2.00–3.00 倍');
assert.equal(result.baselineHeightMm, 20);
assert.equal(result.currentHeightMm, 45);

assert.equal(heightBand(0, 45), null, '缺少有效基线不猜默认值');
assert.equal(heightBand(null, 45), null);
assert.equal(heightBand(20, 0), null, '缺少有效最新高度不猜默认值');
assert.equal(heightBand(20, null), null);
assert.equal(heightBand('', 45), null);
assert.equal(heightBand(20, 'abc'), null);

assert.deepEqual(HEIGHT_BANDS.map((item) => item.value), ['none', 'slight', 'near', 'double', 'over3']);
console.log('height-band tests passed');
