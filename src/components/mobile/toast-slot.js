// 全局只允许一条提示弹窗：新的提示打开时，立刻让上一条（可能来自别的页面/组件实例）关闭，避免上下叠加。
let release = null;

export function claimToastSlot(close) {
  if (release) release();
  const mine = () => close();
  release = mine;
  return () => { if (release === mine) release = null; };
}
