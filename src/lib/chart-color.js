// SVG 渐变颜色解算。
//
// 为什么需要这一步：iOS 的 WebKit 在 <stop> 上解析 CSS var() 会失败，失败后
// stop-color 回退到初始值（黑色），面积填充就变成一块黑。写进 <stop> 的颜色
// 必须是具体色值（rgb()/#hex），不能是 var(--brand-primary) 这样的待求值表达式。
//
// 这里不碰 DOM：把「哪些值算具体颜色」「空值怎么回退」抽成纯函数，
// 组件只负责读计算样式，逻辑本身可以被直接测试。

const UNRESOLVED = /var\(|env\(|currentColor/i;
const TRANSPARENT = /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i;

/**
 * 判断一个颜色字符串能否直接写进 SVG 的 stop-color。
 * var()/env()/currentColor 都需要运行时求值，在 <stop> 里不可靠，一律当作不可用。
 */
export function isConcreteColor(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  if (UNRESOLVED.test(raw)) return false;
  if (TRANSPARENT.test(raw)) return false;
  return true;
}

/**
 * 取一个可以立刻写进 stop-color 的颜色，取不到时返回空串（交给调用方兜底）。
 * 优先级：计算样式解算出的颜色 > 本身就是具体颜色的入参。
 */
export function concreteColor(resolved, raw) {
  if (isConcreteColor(resolved)) return String(resolved).trim();
  if (isConcreteColor(raw)) return String(raw).trim();
  return '';
}

/**
 * 从元素的 color 计算值里解出具体颜色。真实浏览器里 getComputedStyle 会把
 * var(--x) 解析掉，所以这条路径能拿到 rgb(...)；拿不到就返回空串。
 */
export function readConcreteColor(element, view) {
  const scope = view || (typeof window !== 'undefined' ? window : undefined);
  if (!element || !scope?.getComputedStyle) return '';
  try {
    const style = scope.getComputedStyle(element);
    return concreteColor(style?.color, '');
  } catch {
    return '';
  }
}
