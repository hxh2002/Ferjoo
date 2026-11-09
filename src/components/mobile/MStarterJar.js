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
export function jarFaceFloat(mood = 'idle') {
  const { riseHeight } = STATIC_GEOMETRY[mood] || STATIC_GEOMETRY.idle;
  const drop = (riseHeight * (1 - JAR_RISE_SCALE.from)) / 2;
  const from = Number(drop.toFixed(2));
  return { from, to: Number((drop - JAR_FACE_BOB).toFixed(2)) };
}

// 液面高度与表情是两个独立输入；预览表情不参与发酵状态或阈值判断。
export function starterJarGeometry(mood = 'idle', level = null) {
  const design = STATIC_GEOMETRY[mood] || STATIC_GEOMETRY.idle;
  const numericLevel = Number(level);
  if (level == null || !Number.isFinite(numericLevel)) return { ...design, measured: false };

  const riseHeight = 8 + Math.min(1, Math.max(0, numericLevel)) * 44;
  const riseTop = JAR_LIQUID_BOTTOM - riseHeight;
  // 表情保持设计里相对液面的距离；低液面时按设计比例跟随，但底边不越过 y=170。
  const faceTop = Math.min(riseTop + design.faceTop - design.riseTop, JAR_LIQUID_BOTTOM - JAR_FACE_HEIGHT);
  return { ...design, measured: true, riseTop, riseHeight, faceTop };
}
