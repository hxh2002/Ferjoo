import { STAGES, RATIOS, HEIGHTS, diagnoseStarter, parseStarterInput, getTemperatureResponse } from '../algorithms/index.js';

export const mobileOptions = {
  stage: STAGES.map(({ value, label }) => ({ value, label })),
  ratio: RATIOS.map(({ value, label }) => ({ value, label })),
  height: HEIGHTS.map(({ value, label }) => ({ value, label })),
};
export const fieldLabels = { color: '颜色 / 霉斑', smell: '气味', height: '主要涨幅表现', stage: '养护阶段', ratio: '老种 : 水 : 面粉', tempC: '实测温度（°C）', elapsedHours: '喂养后经过小时', ph: 'pH', notes: '备注' };
export const snapshot = (value) => JSON.parse(JSON.stringify(value));
export const newRequestId = () => globalThis.crypto?.randomUUID?.() || `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function emptyCheckin() {
  return { step: 1, starterId: '', color: '', smell: '', height: '', stage: '', ratio: '', tempC: '', elapsedHours: '', ph: '', notes: '', quickText: '' };
}
export function describeField(key, value) {
  if (value === '' || value == null) return '未提供';
  if (value === 'unknown') return '不确定';
  if (value === 'normal') return '未见异常（本次主动确认）';
  if (value === 'suspicious') return '有异常';
  return mobileOptions[key]?.find((item) => item.value === value)?.label || String(value);
}
export function parsePendingText(text) {
  const parsed = parseStarterInput(text);
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => key in fieldLabels));
}
export function validateCheckin(input) {
  const errors = {};
  const risk = input.color === 'suspicious' || input.smell === 'suspicious';
  if (risk) return errors;
  for (const key of ['color', 'smell']) {
    if (!['normal', 'suspicious', 'unknown'].includes(input[key])) errors[key] = '请主动选择本次观察，无法判断可选“不确定”。';
  }
  for (const key of ['stage', 'ratio', 'height']) {
    if (input[key] !== 'unknown' && !mobileOptions[key].some((item) => item.value === input[key])) errors[key] = '请选择一项，或明确选择“不确定”。';
  }
  for (const key of ['tempC', 'elapsedHours', 'ph']) {
    if (input[key] !== '' && input[key] != null && !Number.isFinite(Number(input[key]))) errors[key] = '请输入有效数字，未测量可留空。';
  }
  if (input.elapsedHours !== '' && Number(input.elapsedHours) < 0) errors.elapsedHours = '经过时长不能为负数。';
  if (input.ph !== '' && input.ph != null && (Number(input.ph) < 0 || Number(input.ph) > 14)) errors.ph = 'pH 应在 0–14 之间。';
  return errors;
}
export function protectResult(raw, input) {
  if (raw.status === 'discard') {
    const { status, tone, badge, title, subtitle, reasons, actions, safety, citations } = raw;
    return snapshot({ status, tone, badge, title, subtitle, reasons, actions, safety, citations });
  }
  const result = snapshot(raw);
  delete result.trace;
  delete result.expected;
  result.metrics = [];
  const hasTemp = input.tempC !== '' && input.tempC != null && Number.isFinite(Number(input.tempC));
  const reliable = hasTemp && getTemperatureResponse(Number(input.tempC)).reliable;
  const hasTime = input.elapsedHours !== '' && input.elapsedHours != null;
  if (input.stage !== 'mature' || !reliable || !hasTime || !['remaining', 'reached', 'past-peak', 'overdue'].includes(result.timing?.status)) delete result.timing;
  if (['double', 'peak_plus', 'over3', 'fallen'].includes(input.height)) delete result.timing;
  if (!hasTemp) {
    result.title = '已记录观察；缺少实测温度，暂不作速度判断';
    result.badge = '估时条件不足';
    result.reasons = ['未提供实测温度，不将算法的默认温度当作你的测量。'];
    result.actions = ['观察并记录下一次高度变化；需要估时可补充实测温度。'];
  }
  result.timingNote = result.timing ? '经验范围，假设温度与喂养条件保持稳定；不是安全保证，不是倒计时。' : '未展示剩余估时：需要成熟酵种、可靠实测温度和已过时长，且尚未翻倍或越峰。';
  return result;
}
export function generateMobileReport(input, accountId) {
  const facts = snapshot(input);
  const errors = validateCheckin(facts);
  if (Object.keys(errors).length) return { errors };
  const risk = facts.color === 'suspicious' || facts.smell === 'suspicious';
  let result;
  if (!risk && (facts.color === 'unknown' || facts.smell === 'unknown')) {
    result = { status: 'needs-check', badge: '需要进一步检查', title: '安全问题尚未确认，不能给出正常养护结论', reasons: ['不确定不等于正常。请在明亮环境检查彩色斑块、绒毛霉菌及腐败气味。'], actions: ['暂勿使用或品尝；补充本次颜色和气味观察。'] };
  } else if (!risk && ['stage', 'ratio', 'height'].some((key) => facts[key] === 'unknown')) {
    result = { status: 'incomplete', badge: '信息不足', title: '请补充关键事实后再判断活性', reasons: ['阶段、比例或主要涨幅不确定，不使用算法默认值替代。'], actions: ['保留本次观察，确认缺项后重新生成建议。'] };
  } else {
    result = protectResult(diagnoseStarter({ ...facts, tempC: facts.tempC === '' ? undefined : facts.tempC, elapsedHours: facts.elapsedHours === '' ? null : facts.elapsedHours }), facts);
  }
  return { report: { schemaVersion: 'mobile-observation-v1', algorithmVersion: 'diagnosis-public-api-v1', accountId: accountId || 'guest', requestId: newRequestId(), starterId: facts.starterId || null, occurredAt: new Date().toISOString(), input: facts, result, savedId: null, source: '本次手工确认；一句话识别须逐项确认' } };
}
const reports = new Map();
const sessionKey = (accountId) => `ferjoo:mobile:report:${accountId || 'guest'}`;
export function storeSessionReport(accountId, report) {
  const key = sessionKey(accountId);
  reports.set(key, snapshot(report));
  try { globalThis.sessionStorage?.setItem(key, JSON.stringify(report)); } catch { /* In-memory report remains usable. */ }
}
export function loadSessionReport(accountId) {
  const key = sessionKey(accountId);
  if (reports.has(key)) return snapshot(reports.get(key));
  try {
    const value = JSON.parse(globalThis.sessionStorage?.getItem(key) || 'null');
    if (value?.input && value?.result && value.accountId === (accountId || 'guest')) return snapshot(value);
  } catch { /* Corrupt browser storage is not a task failure. */ }
  return null;
}
export function reportText(report) {
  const result = report.result;
  return [result.badge, result.title, `观察时刻：${report.occurredAt}`, report.savedId ? '已云端保存' : '已生成，未云端保存', ...(result.reasons || []), '下一步：', ...(result.actions || []), ...(result.timing ? [result.timing.display, result.timingNote] : []), ...(result.ph ? [result.ph.label, result.ph.message] : []), ...(result.safety || [])].filter(Boolean).join('\n');
}
