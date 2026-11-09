// 观察流程的纯决策：「下一步 / 上一步」落到哪一页、哪些错误当前页看得见。
// 视图只负责执行这里返回的结果，避免出现「校验报错但当前页没有对应控件」的死路。
const SAFETY_VALUES = ['normal', 'suspicious', 'unknown'];
const isSafetyAnswer = (value) => SAFETY_VALUES.includes(value);
const isFlagged = (value) => value === 'suspicious' || value === 'unknown';

// 颜色或气味可疑 / 不确定 → 跳过「本轮背景」，走安全优先路径。
export function skipsBackground(draft) {
  return isFlagged(draft?.color) || isFlagged(draft?.smell);
}

// 观察第 1 / 2 / 3 页各自能看到并能回答的字段。
const PART_FIELD = { 1: 'color', 2: 'smell', 3: 'height' };
const STEP_FIELDS = { 2: ['stage', 'ratio', 'tempC', 'elapsedHours', 'ph'] };

export function observationReady(draft, part = 1) {
  if (part === 1 || part === 2) return isSafetyAnswer(draft?.[PART_FIELD[part]]);
  // 安全优先路径不要求涨幅；这一页正常只会出现在常规路径上。
  if (skipsBackground(draft)) return true;
  return draft?.height !== '' && draft?.height != null;
}

// 错误所在的页面：背景字段 → 第 2 步；颜色 / 气味 / 涨幅 → 第 1 步对应的观察页。
export function locateErrors(errors) {
  const keys = Object.keys(errors || {});
  for (const part of [1, 2, 3]) if (keys.includes(PART_FIELD[part])) return { step: 1, observePart: part };
  if (keys.some((key) => STEP_FIELDS[2].includes(key))) return { step: 2, observePart: 1 };
  return { step: 1, observePart: 1 };
}

// 返回 { type: 'stay' } | { type: 'part', observePart } | { type: 'errors', errors } | { type: 'step', step }
export function planNext({ draft, step, observePart, validate }) {
  if (step === 1) {
    const flagged = skipsBackground(draft);
    if (flagged) {
      // 安全优先：只校验当前页已看见的那一项；其余字段留给核对页和报告语义处理，绝不报出看不见的错。
      if (observePart !== 3 && !observationReady(draft, observePart)) {
        const key = PART_FIELD[observePart];
        return { type: 'errors', errors: { [key]: '请先选择一项；无法判断可选“不确定”。' } };
      }
      return { type: 'step', step: 3 };
    }
    if (observePart < 3) return observationReady(draft, observePart) ? { type: 'part', observePart: observePart + 1 } : { type: 'stay' };
    const visible = pickErrors(validate(draft), ['height']);
    if (Object.keys(visible).length) return { type: 'errors', errors: visible };
    return { type: 'step', step: 2 };
  }
  const visible = pickErrors(validate(draft), STEP_FIELDS[2]);
  if (Object.keys(visible).length) return { type: 'errors', errors: visible };
  return { type: 'step', step: Math.min(3, step + 1) };
}

// 返回 { step, observePart }。核对页（安全优先）回到触发跳过的那一页：颜色优先，其次气味。
export function planBack({ draft, step, observePart }) {
  if (step === 1) return { step: 1, observePart: Math.max(1, observePart - 1) };
  if (step === 3 && skipsBackground(draft)) return { step: 1, observePart: isFlagged(draft.color) ? 1 : 2 };
  const target = step - 1;
  return { step: target, observePart: target === 1 ? 3 : observePart };
}

function pickErrors(all, keys) {
  return Object.fromEntries(Object.entries(all || {}).filter(([key]) => keys.includes(key)));
}
