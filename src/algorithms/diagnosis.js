import { HEIGHTS, RATIOS, RATIO_BASE_HOURS, STAGES } from './dimensions.js';
import { isContaminated, normalizeTemp, resolve, roundDisplay } from './normalization.js';
import { predictDoublingTime } from './doubling-predictor.js';
import { resolveEvidenceRefs } from '../references/index.js';

function label(value, options) {
  return options.find((x) => x.value === value)?.label || value;
}

export function assessPh(ph) {
  const n = Number(ph);
  if (!Number.isFinite(n)) {
    return { status: 'unknown', label: '未提供 pH', message: '如果你有可靠的 pH 测量，可作为趋势辅助；不要仅凭一次读数判断酵种健康。' };
  }
  if (n < 2.5 || n > 7) {
    return { status: 'invalid', label: 'pH 数值异常', message: '请检查仪器校准、探头与输入值。' };
  }
  if (n <= 3.8) {
    return { status: 'acidic', label: `pH ${n.toFixed(1)} · 酸化充分`, message: '处于 Ferjoo 的经验酸化观察区间附近；仍应结合气味、外观和发酵趋势。' };
  }
  if (n < 4.6) {
    return { status: 'acidifying', label: `pH ${n.toFixed(1)} · 正在酸化`, message: '已低于 4.6 的酸化参考边界，但成熟度仍需结合连续活性判断。' };
  }
  return { status: 'high', label: `pH ${n.toFixed(1)} · 尚未充分酸化`, message: '若为新起种可继续按计划观察；若成熟酵种长期如此且活性弱，应检查刷新、温度与测量方法。' };
}

function stageAdvice(stage) {
  const map = {
    start_d1: {
      title: '这是建立期，不必追求立刻翻倍',
      tone: 'info',
      reasons: ['第 1 天的气泡与膨胀不能代表稳定群落已经建立。', '早期的气味与活动波动很常见。'],
      actions: ['保持固定刷新节奏与容器标记。', '观察连续数天的重复表现，而不是单次“爆发”。'],
      evidence: ['MCKENNEY-2023', 'CALVERT-2021', 'FERJOO-EXP-STAGE-001']
    },
    start_active: {
      title: '活跃不等于成熟，继续看连续稳定性',
      tone: 'info',
      reasons: ['新起种在演替过程中可能出现明显的阶段性活跃。', '成熟判断更依赖连续、可重复的上升与回落节律。'],
      actions: ['维持一致的面粉、比例和温度。', '记录达到峰值所需时间，至少连续观察多个刷新周期。'],
      evidence: ['MCKENNEY-2023', 'LANDIS-2021', 'FERJOO-EXP-STAGE-001']
    },
    start_stable: {
      title: '正在接近稳定，重点看重复性',
      tone: 'good',
      reasons: ['连续周期中相似的上升速度比某一次高度更有信息量。'],
      actions: ['继续固定流程并记录峰值时间。', '若连续多个周期表现接近，可逐步按成熟酵种方式使用。'],
      evidence: ['LANDIS-2021', 'CALVERT-2021', 'FERJOO-EXP-STAGE-001']
    },
    revive: {
      title: '复苏阶段，给酵种几个连续刷新周期',
      tone: 'info',
      reasons: ['冷藏或长期低活性后，单次刷新未必立刻恢复峰值速度。'],
      actions: ['在适宜温度下连续刷新。', '以气味正常、上升加快和周期稳定作为恢复信号。'],
      evidence: ['CALVERT-2021', 'DE-VUYST-2009', 'FERJOO-EXP-STAGE-001']
    },
    fridge: {
      title: '冷藏维护时，低活性本身不代表异常',
      tone: 'info',
      reasons: ['低温会显著改变发酵速度与维护节奏。'],
      actions: ['需要烘焙前先回温并进行一到数次刷新。', '若出现异常颜色、绒毛状霉菌或腐败气味，直接丢弃。'],
      evidence: ['CALVERT-2021', 'CSU-STARTER-2025']
    }
  };
  return map[stage] || null;
}

function matureActivity({ height, elapsedHours, predictor }) {
  const elapsed = Number(elapsedHours);
  if (height === 'fallen') return {
    title: '酵种已经越过峰值',
    tone: 'warn',
    reasons: ['罐壁痕迹与回落通常表示这一轮已经过峰。'],
    actions: ['若准备烘焙，下次可在峰值附近使用。', '若只是维护，现在可以刷新。']
  };
  if (height === 'hooch') return {
    title: '更像是饥饿/间隔偏长，而不是单独的污染信号',
    tone: 'warn',
    reasons: ['表面酒精液层可以是发酵副产物，需与颜色、霉菌和气味一起判断。'],
    actions: ['确认没有彩色或绒毛状霉菌后再刷新。', '缩短下一轮间隔或调整刷新比例。']
  };
  if (['double', 'peak_plus', 'over3'].includes(height)) return {
    title: height === 'over3' ? '活性很强，已经明显超过翻倍' : '活性良好，已经达到翻倍附近',
    tone: 'good',
    reasons: ['当前高度显示这一轮已经达到可观察的强活性区间。'],
    actions: ['记录峰值与回落时间，作为你这份酵种的个人基线。', '烘焙时优先使用连续周期表现稳定的状态。']
  };

  if (Number.isFinite(elapsed) && predictor?.highHours && elapsed > predictor.highHours * 1.2 && ['none', 'slight'].includes(height)) {
    return {
      title: '这一轮明显偏慢',
      tone: 'danger',
      reasons: ['在当前比例与温度的经验窗口之后，仍只有很少上升。', '可能与酵种状态、温度波动、刷新比例、面粉或测量方式有关。'],
      actions: ['先确认实际面团温度而非只看室温。', '连续两到三轮固定条件观察趋势。', '若同时有异常颜色、绒毛霉菌或腐败气味，请丢弃。']
    };
  }

  if (height === 'near') return {
    title: '正在接近翻倍，继续等峰值',
    tone: 'good',
    reasons: ['上升已接近翻倍，说明这一轮发酵正在推进。'],
    actions: ['继续观察至最高点并记录时间。', '不要为了追求更高温度而超过可靠温区。']
  };

  return {
    title: predictor?.status === 'remaining' ? '目前仍在预计发酵窗口内' : '活性暂时偏低，先看完整周期',
    tone: 'info',
    reasons: ['单次较低高度在预计窗口内不能直接判定为“弱”。', '比例、温度与酵种个体差异都会改变可见上升速度。'],
    actions: ['保持当前条件继续观察到预计窗口结束。', '用橡皮筋或记号标记起始高度，记录峰值时间。']
  };
}

export function diagnoseStarter(input = {}) {
  const stage = resolve(input.stage, STAGES, 'mature');
  const ratio = resolve(input.ratio, RATIOS, '1:2:2');
  const height = resolve(input.height, HEIGHTS, 'slight');
  const { tempC, temp } = normalizeTemp(input);
  const elapsedHours = input.elapsedHours === '' || input.elapsedHours == null ? null : Number(input.elapsedHours);
  const ph = input.ph === '' || input.ph == null ? null : Number(input.ph);
  const pH = assessPh(ph);

  const base = RATIO_BASE_HOURS[ratio] || [6, 8];
  const predictor = predictDoublingTime({ ratio, tempC, height, elapsedHours });
  const contaminated = isContaminated(input);

  if (contaminated) {
    const evidenceKeys = ['CSU-STARTER-2025', 'FDA-RAW-FLOUR-2023'];
    return {
      status: 'discard', tone: 'danger', badge: '食品安全优先',
      title: '请停止使用并丢弃这份酵种',
      subtitle: '异常颜色、绒毛状霉菌或明显腐败气味优先于所有活性判断。',
      metrics: metricPack(stage, ratio, tempC, predictor),
      timing: predictor,
      ph: pH,
      reasons: ['可疑彩色斑块、绒毛状霉菌或腐败气味不应通过“多喂几次”来挽救。'],
      actions: ['整份丢弃，不要品尝。', '清洁接触过的容器与工具后再重新起种。', '生面粉与生酵种本身也不应直接品尝。'],
      safety: ['食品安全信号覆盖所有发酵速度、pH 和高度判断。'],
      evidenceKeys,
      citations: resolveEvidenceRefs(evidenceKeys),
      trace: { stage, ratio, height, temp, tempC, elapsedHours, ph, contaminated: true }
    };
  }

  const stageOverride = stageAdvice(stage);
  const core = stageOverride || matureActivity({ height, elapsedHours, predictor });
  const evidenceKeys = new Set([
    ...(core.evidence || []),
    'CALVERT-2021',
    'LANDIS-2021',
    'GANZLE-1998',
    'FERJOO-EXP-TIME-001',
    'FDA-RAW-FLOUR-2023'
  ]);

  if (tempC > 32) {
    core.reasons.push('当前温度超过 32°C：温度响应在高温区不是线性加速，Ferjoo 不在这里给出可靠翻倍倒计时。');
    core.actions.unshift('优先把酵种移到更温和、稳定的温区，再重新观察一轮。');
    evidenceKeys.add('BRANDT-2004');
    evidenceKeys.add('VRANCKEN-2011');
  }
  if (height === 'hooch') evidenceKeys.add('CSU-STARTER-2025');

  const timingText = predictor.reliable
    ? predictor.display
    : '高温条件下不显示精确剩余时间；先降低温度后再估算。';

  const evidenceArray = [...evidenceKeys];
  return {
    status: core.tone === 'danger' ? 'attention' : 'observe',
    tone: core.tone,
    badge: core.tone === 'good' ? '状态不错' : core.tone === 'warn' ? '需要调整' : core.tone === 'danger' ? '重点观察' : '继续观察',
    title: core.title,
    subtitle: `${label(stage, STAGES)} · ${label(ratio, RATIOS)} · ${label(height, HEIGHTS)}`,
    metrics: metricPack(stage, ratio, tempC, predictor),
    expected: { baseAt25to28: `${base[0]}–${base[1]} 小时`, current: timingText },
    timing: predictor,
    ph: pH,
    reasons: core.reasons,
    actions: core.actions,
    safety: ['不直接品尝生面粉或生酵种。', '若出现彩色/绒毛状霉菌或明显腐败气味，直接丢弃。'],
    evidenceKeys: evidenceArray,
    citations: resolveEvidenceRefs(evidenceArray),
    trace: {
      stage, ratio, height, temp, tempC,
      elapsedHours: Number.isFinite(elapsedHours) ? elapsedHours : null,
      ph: Number.isFinite(ph) ? ph : null,
      predictor: {
        status: predictor.status,
        lowHours: roundDisplay(predictor.lowHours),
        highHours: roundDisplay(predictor.highHours),
        remainingLowHours: roundDisplay(predictor.remainingLowHours),
        remainingHighHours: roundDisplay(predictor.remainingHighHours)
      }
    }
  };
}

function metricPack(stage, ratio, tempC, predictor) {
  return [
    { label: '阶段', value: label(stage, STAGES) },
    { label: '刷新比例', value: label(ratio, RATIOS) },
    { label: '温度', value: `${roundDisplay(tempC)}°C` },
    { label: '翻倍估算', value: predictor.display }
  ];
}

export function formatAdvice(result) {
  const lines = [
    `${result.badge}｜${result.title}`,
    result.subtitle,
    '',
    `时间：${result.timing?.display || '—'}`,
    `pH：${result.ph?.label || '未提供'}`,
    '',
    '为什么：',
    ...(result.reasons || []).map((x) => `- ${x}`),
    '',
    '下一步：',
    ...(result.actions || []).map((x) => `- ${x}`),
    '',
    '安全提醒：',
    ...(result.safety || []).map((x) => `- ${x}`)
  ];
  return lines.join('\n');
}
