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

export function nextJarMood(mood) {
  const index = JAR_MOODS.indexOf(mood);
  return JAR_MOODS[(index + 1 + JAR_MOODS.length) % JAR_MOODS.length];
}

// 液面高度与表情是两个独立输入；预览表情不参与发酵状态或阈值判断。
export function starterJarGeometry(mood = 'idle', level = null) {
  const design = STATIC_GEOMETRY[mood] || STATIC_GEOMETRY.idle;
  const numericLevel = Number(level);
  if (level == null || !Number.isFinite(numericLevel)) return { ...design, measured: false };

  const riseHeight = 8 + Math.min(1, Math.max(0, numericLevel)) * 44;
  const riseTop = 170 - riseHeight;
  // 表情保持当前设计相对液面的距离；极低液面动画交由组件裁切在罐体内。
  const faceTop = riseTop + design.faceTop - design.riseTop;
  return { ...design, measured: true, riseTop, riseHeight, faceTop };
}
