// 今日页与记录页共用最近一次选中的酵种，记录页默认值因此与今日页一致。
const STARTER_KEY = 'ferjoo.mobile.starter';

export function readSelectedStarter(owner) {
  if (!owner || typeof localStorage === 'undefined') return '';
  try { return localStorage.getItem(`${STARTER_KEY}:${owner}`) || ''; } catch { return ''; }
}

export function rememberSelectedStarter(owner, id) {
  if (!owner || !id || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(`${STARTER_KEY}:${owner}`, id); } catch { /* 存储不可用时退回首个酵种 */ }
}
