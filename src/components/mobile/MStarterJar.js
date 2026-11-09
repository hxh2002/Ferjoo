export const JAR_MOODS = Object.freeze(['idle', 'eating', 'peak', 'hungry']);

export const JAR_MOOD_LABELS = Object.freeze({
  idle: '正常待机',
  eating: '吃饭',
  peak: 'Peak',
  hungry: '饿了'
});

export const JAR_MOOD_NODES = Object.freeze({
  idle: '370:16074',
  eating: '370:16117',
  peak: '370:16159',
  hungry: '370:16201'
});

const STATIC_GEOMETRY = Object.freeze({
  idle: Object.freeze({ riseNode: '370:16102', riseTop: 136, riseHeight: 34, faceNode: '370:16112', faceTop: 146 }),
  eating: Object.freeze({ riseNode: '370:16145', riseTop: 119, riseHeight: 51, faceNode: '370:16155', faceTop: 137 }),
  peak: Object.freeze({ riseNode: '370:16187', riseTop: 96, riseHeight: 74, faceNode: '370:16197', faceTop: 125.5 }),
  hungry: Object.freeze({ riseNode: '370:16229', riseTop: 127, riseHeight: 43, faceNode: '370:16239', faceTop: 141 })
});

export const nextJarMood = (mood) => {
  const index = JAR_MOODS.indexOf(mood);
  return JAR_MOODS[(index + 1 + JAR_MOODS.length) % JAR_MOODS.length];
};

// 罐体可视区域的底边与五官高度：五官底边必须压在 y<=170 内，否则会掉出罐体。
export const JAR_LIQUID_BOTTOM = 170;
export const JAR_FACE_HEIGHT = 15;
// 液面 scaleY 的关键帧端点，与 @keyframes jar-rise 保持一致。
export const JAR_RISE_SCALE = Object.freeze({ from: 0.65, to: 1.25 });
// 设计里的五官浮动幅度是 18px，保留不动；需要修正的只是它的基准相位。
export const JAR_FACE_BOB = 18;

// 五官的浮动必须跟液面同相位，不能写死 0 → -18：
// 液面以中心缩放，最低那一帧顶部会下移 height×(1-0.65)/2（待机 5.95px），
// 此时五官若还在设计原点上，就会露出液面约 6px，看起来像飘在罐子里。
// 这里把浮动区间整体下移一个 drop，幅度仍是设计的 18px，最低帧刚贴住液面。
// 实测液面不做伸缩呼吸，五官只在液面内轻轻浮动 3px。
export const JAR_MEASURED_BOB = 3;
export function jarFaceFloat(mood = 'idle', measured = false) {
  if (measured) return { from: 0, to: -JAR_MEASURED_BOB };
  const { riseHeight } = STATIC_GEOMETRY[mood] || STATIC_GEOMETRY.idle;
  const drop = (riseHeight * (1 - JAR_RISE_SCALE.from)) / 2;
  const from = Number(drop.toFixed(2));
  return { from, to: Number((drop - JAR_FACE_BOB).toFixed(2)) };
}

// 实测液面：起点（0%）对应待机设计的 34px，涨得越高越接近 Peak 设计的 74px。
export const JAR_LEVEL_HEIGHT = Object.freeze({ min: STATIC_GEOMETRY.idle.riseHeight, max: STATIC_GEOMETRY.peak.riseHeight });
// 对数衰减液位，只求视觉定性：level = ln(1 + k·r) / ln(1 + k·(full - 1))，r = 高度/起点 - 1。
// k=5、full=3.5：1 倍为空（待机液面），2 倍约 70%，常见 Peak（约 2.4 倍）约 81%，3.5 倍及以上封顶，越接近顶部涨得越慢。
export const JAR_LEVEL_CURVE = Object.freeze({ k: 5, fullRatio: 3.5 });
export function jarLevel(heightMm, baselineMm) {
  const height = Number(heightMm);
  const baseline = Number(baselineMm);
  if (!(height > 0) || !(baseline > 0)) return null;
  const { k, fullRatio } = JAR_LEVEL_CURVE;
  const rise = Math.max(0, height / baseline - 1);
  return Math.min(1, Math.log1p(k * rise) / Math.log1p(k * (fullRatio - 1)));
}

const levelTop = (level) => JAR_LIQUID_BOTTOM - (JAR_LEVEL_HEIGHT.min + Math.min(1, Math.max(0, level)) * (JAR_LEVEL_HEIGHT.max - JAR_LEVEL_HEIGHT.min));

// 液面高度与表情是两个独立输入：level 只决定液面，mood 只决定表情与液面轮廓。
export function starterJarGeometry(mood = 'idle', level = null) {
  const design = STATIC_GEOMETRY[mood] || STATIC_GEOMETRY.idle;
  const numericLevel = Number(level);
  if (level == null || !Number.isFinite(numericLevel)) return { ...design, measured: false };

  const riseTop = levelTop(numericLevel);
  const riseHeight = JAR_LIQUID_BOTTOM - riseTop;
  // 表情保持设计里相对液面的距离，但底边不越过 y=170。
  const faceTop = Math.min(riseTop + design.faceTop - design.riseTop, JAR_LIQUID_BOTTOM - JAR_FACE_HEIGHT);
  return { ...design, measured: true, riseTop, riseHeight, faceTop };
}

// 峰值痕迹（6px 高，线在中间）贴着峰值液面的波峰；回落幅度很小时也至少高出当前液面 6px，保证肉眼可辨。
export function jarPeakTraceTop(peakLevel, level) {
  const peak = Number(peakLevel);
  if (peakLevel == null || !Number.isFinite(peak)) return null;
  const top = levelTop(peak) - 2;
  const current = Number(level);
  return level == null || !Number.isFinite(current) ? top : Math.min(top, levelTop(current) - 6);
}

// 设备页的真实心情：没有进行中的一轮 = 待机；喂养后上涨（含达到 2 倍的 pre-peak）= 吃饭；
// 锁定 last-peak = Peak；锁定后继续回落 = 饿了。
export const RISE_PHASE_MOODS = Object.freeze({ rising: 'eating', 'pre-peak': 'eating', peak: 'peak', fallen: 'hungry' });
export function jarMoodFor({ active = false, phase = null } = {}) {
  return active ? RISE_PHASE_MOODS[phase] || 'eating' : 'idle';
}
