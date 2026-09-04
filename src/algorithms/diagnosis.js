import { STAGES, RATIOS, HEIGHTS, TEMPS } from './dimensions.js';
import { resolve, normalizeTemp, isContaminated, formatHours } from './normalization.js';
import {
  predictDoublingTime,
  priorPhysicalWindow,
  getTemperatureResponse,
  getCurrentTemperature
} from './doubling-predictor.js';
import { resolveEvidenceRefs } from '../references/index.js';

function addTrace(result, ruleId, evidenceRefs, note) {
  result.ruleTrace.push({ ruleId, note:note || '' });
  for (const ref of evidenceRefs || []) {
    if (!result.evidenceRefs.includes(ref)) result.evidenceRefs.push(ref);
  }
}

function finalizeResult(result) {
  if (!result.evidenceRefs.includes('FDA-RAW-FLOUR-2023')) {
    result.evidenceRefs.push('FDA-RAW-FLOUR-2023');
  }
  result.citations = resolveEvidenceRefs(result.evidenceRefs);
  return result;
}

function assessPh(input) {
  if (input == null || input === '') return null;
  const value = Number(input);
  if (!Number.isFinite(value) || value < 2.5 || value > 7) {
    return { value:Number.isFinite(value) ? value : null, band:'invalid', level:'warn', message:'pH 数值超出本工具的可解释范围，请核对测量与输入。', evidenceRefs:[] };
  }
  if (value < 3.3) {
    return { value, band:'below-brand-target', level:'warn', message:'低于 Dr. Ferjoo 的 3.3–3.8 经验目标区间；结合回落、饥饿和实际发酵曲线判断。', evidenceRefs:['FERJOO-EXP-STAGE-001'] };
  }
  if (value <= 3.8) {
    return { value, band:'brand-target', level:'ok', message:'落在 Dr. Ferjoo 的 3.3–3.8 经验目标区间；这不是通用成熟度或安全保证。', evidenceRefs:['FERJOO-EXP-STAGE-001'] };
  }
  if (value < 4.6) {
    return { value, band:'below-acidification-reference', level:'info', message:'低于 pH 4.6 酸化参考阈值；仍需结合卫生、污染观察与充分烘烤。', evidenceRefs:['CSU-STARTER-2025'] };
  }
  return { value, band:'above-acidification-reference', level:'warn', message:'尚未低于 pH 4.6 酸化参考阈值；若并非起种早期，建议维持规律刷新并复测。', evidenceRefs:['CSU-STARTER-2025'] };
}

function weakReasons(temp, result) {
  if (temp.coef >= 2) {
    result.reasons.push('环境温度较低（<20℃），微生物整体活性会明显放慢');
    result.actions.push('移入 25-28℃ 的稳定环境，再按预期时间窗口观察');
  }
  result.reasons.push('酵种可能已饥饿，或喂养间隔过长');
  result.actions.push('按当前比例及时喂养；长期高酸/饥饿可用 1:5:5 重置降酸');
  result.reasons.push('水质、面粉新鲜度与维护节奏也会影响活性');
  result.actions.push('使用适合发酵的饮用水与新鲜面粉，保持容器清洁');
  result.reasons.push('同时排除污染：出现异色、绒毛状霉变或明显腐败异味时弃用重起');
}

function applyStageOverride(stageValue, height, temp, result) {
  const hv = height ? height.value : null;
  switch (stageValue) {
    case 'start_d1':
      result.state = '起种初期·观察期';
      result.level = 'info';
      result.reasons.push('第 1-2 天菌群尚在建立，短期内无明显体积变化可以出现');
      if (hv === 'hooch') {
        result.reasons.push('起种早期表面液体与强烈酸味可能伴随菌群快速更替，需继续观察是否出现真正污染信号');
        result.actions.push('若无异色/霉变，可倒掉液体或搅匀后继续按 1:1:1 喂养');
      } else if (hv === 'over3' || hv === 'fallen') {
        result.reasons.push('起种最初几天的大幅上升或回落可能是早期菌群更替中的短暂“假性活跃”，不能据此宣布成熟');
        result.actions.push('继续按固定节奏记录至少数个周期，确认能重复上升后再判断稳定性');
      }
      result.actions.push('保持容器清洁并松盖，维持稳定温暖环境后观察 24 小时');
      result.actions.push('记录气泡、气味与体积变化，不要品尝生酵种');
      result.actions.push('次日继续按 1:1:1 的固定节奏喂养');
      addTrace(result, 'STAGE.START_D1', ['FERJOO-EXP-STAGE-001','CALVERT-2021','MCKENNEY-2023'], '起种初期使用独立基线');
      return true;

    case 'start_active':
      if (hv === 'none' || hv === 'slight') {
        result.state = '起种活跃期·反应偏弱';
        result.level = 'warn';
        result.reasons.push('第 3-5 天通常应逐步出现更多气泡与体积增长；持续偏弱时需检查温度、水和面粉状态');
        result.actions.push('检查环境是否至少约 20℃；需要加速时可移入 25-28℃');
        result.actions.push('确认用水与面粉新鲜、容器清洁，继续规律喂养');
      } else if (hv === 'near' || hv === 'double' || hv === 'peak_plus') {
        result.state = '起种活跃期·进展正常';
        result.level = 'ok';
        result.reasons.push('气泡与体积增长说明菌群正在建立，现阶段趋势正常');
      } else if (hv === 'over3') {
        result.state = '起种活跃期·大幅上升';
        result.level = 'info';
        result.reasons.push('大幅上升表明当前产气明显，但单次高度不能证明菌群已经稳定');
        result.actions.push('标记峰值并继续观察后续周期是否可重复，不要只凭倍数宣布成熟');
      } else if (hv === 'fallen') {
        result.state = '起种活跃期·已完成一次升降';
        result.level = 'info';
        result.reasons.push('已经回落说明出现过一次上升过程；需记录喂养后到峰值的时间并观察是否可重复');
        result.actions.push('重新喂养并记录下一周期的峰值时间、高度与顶部形态');
      } else if (hv === 'hooch') {
        result.state = '起种活跃期·液体层待核验';
        result.level = 'warn';
        result.reasons.push('液体层与饥饿/分层有关，但不能与有色或绒毛状生长混为一谈');
        result.actions.push('先排除异色与霉变；确认只是液体层后再刷新并缩短下一次观察间隔');
      } else {
        result.state = '起种活跃期·信息不足';
        result.level = 'info';
        result.reasons.push('缺少体积状态，无法判断当前活跃阶段的进展位置');
        result.actions.push('补充气泡与体积变化后重新判断');
      }
      result.actions.push('保持规律喂养，尽量固定比例、温度和观察时间');
      result.actions.push('记录气味从刺激性向更稳定的酸香转变');
      addTrace(result, 'STAGE.START_ACTIVE', ['FERJOO-EXP-STAGE-001','CALVERT-2021','MCKENNEY-2023'], `高度分支=${hv || 'missing'}`);
      return true;

    case 'start_stable':
      if (hv === 'double' || hv === 'peak_plus') {
        result.state = '起种完成·接近成熟';
        result.level = 'ok';
        result.reasons.push('喂养后能够稳定明显上升或翻倍，说明已接近可用于日常维护的活性水平');
        result.actions.push('可转入日常喂养或冷藏保存，并继续用重复周期确认稳定性');
        result.actions.push('做面包前以实际发酵表现为准，不把单一“浮水试验”作为唯一活性标准');
      } else if (hv === 'none' || hv === 'slight') {
        result.state = '起种稳定期·尚未成熟';
        result.level = 'warn';
        result.reasons.push('第 5-7 天仍无稳定明显上升时，需要继续排查温度、用水、面粉与喂养节奏');
        result.actions.push('维持稳定环境并继续规律喂养 2-3 天');
        result.actions.push('若出现异色、绒毛状霉变或明显腐败异味，整罐弃用重起');
      } else if (hv === 'near') {
        result.state = '起种稳定期·接近目标';
        result.level = 'info';
        result.reasons.push('已明显上升并接近翻倍，但成熟度应以连续周期的可重复表现为准');
        result.actions.push('继续观察本轮峰值，并记录下一轮是否在相似条件下重复出现');
      } else if (hv === 'over3') {
        result.state = '起种稳定期·强活待复核';
        result.level = 'ok';
        result.reasons.push('大幅上升显示产气活性强；仍需确认这不是单次异常或早期假性活跃');
        result.actions.push('记录回落时点并用相同条件再做一个周期，确认重复性后转入日常维护');
      } else if (hv === 'fallen') {
        result.state = '起种稳定期·已过本轮峰值';
        result.level = 'info';
        result.reasons.push('回落证明本轮出现过上升，但当前已错过峰值；成熟判定仍需连续周期记录');
        result.actions.push('刷新后从零点开始记录下一轮峰值时间，不用回落高度反推精确活性');
      } else if (hv === 'hooch') {
        result.state = '起种稳定期·饥饿/分层';
        result.level = 'warn';
        result.reasons.push('出现液体层提示维护节奏或分层需要处理，不能作为成熟证据');
        result.actions.push('先排除异色和绒毛状霉变；确认无污染后刷新并记录完整周期');
      } else {
        result.state = '起种稳定期·信息不足';
        result.level = 'info';
        result.reasons.push('缺少体积状态，无法判断稳定性');
        result.actions.push('补充完整上升曲线后再判断成熟度');
      }
      addTrace(result, 'STAGE.START_STABLE', ['FERJOO-EXP-STAGE-001','CSU-STARTER-2025','MCKENNEY-2023'], `高度分支=${hv || 'missing'}`);
      return true;

    case 'fridge':
      result.state = '冷藏休眠期';
      result.level = 'info';
      result.reasons.push('冷藏状态下发酵活性会显著放慢，无明显上升通常不代表失活');
      if (hv === 'hooch') {
        result.level = 'warn';
        result.reasons.push('冷藏期出现较多液体层，常提示已经消耗较多营养、需要刷新');
        result.actions.push('确认无霉变后，可倒掉或搅入液体并喂养，再按维护计划冷藏');
      } else if (hv === 'double' || hv === 'peak_plus' || hv === 'over3' || hv === 'fallen') {
        result.state = '冷藏期·需澄清观察时点';
        result.level = 'info';
        result.reasons.push('该高度可能记录的是入冰箱前、回温后或冷藏中的残余变化；三者不能共用同一时间基线');
        result.actions.push('补充高度变化发生在入冷藏前、冷藏中还是回温后，再选择对应阶段判断');
      }
      result.actions.push('按你的烘焙频率制定固定的冷藏喂养周期；使用前先恢复到稳定上升状态');
      addTrace(result, 'STAGE.FRIDGE', ['FERJOO-EXP-STAGE-001','CSU-STARTER-2025'], `高度分支=${hv || 'missing'}`);
      return true;

    case 'revive':
      if (hv === 'double' || hv === 'peak_plus' || hv === 'over3') {
        result.state = '复活恢复期·已恢复';
        result.level = 'ok';
        result.reasons.push('已恢复到明显上升/翻倍活性，可回到正常使用节奏');
        result.actions.push('继续一次正常喂养或按配方需要使用');
      } else if (hv === 'fallen') {
        result.state = '复活恢复期·已过本轮峰值';
        result.level = 'info';
        result.reasons.push('回落说明复活后出现过明显发酵，但当前观测已晚于本轮峰值');
        result.actions.push('刷新后再记录一个完整周期；能重复明显上升再视为稳定恢复');
      } else if (hv === 'hooch') {
        result.state = '复活恢复期·饥饿/分层';
        result.level = 'warn';
        result.reasons.push('液体层提示储存后营养耗尽或分层，需要先排除污染再刷新');
        result.actions.push('确认没有异色或绒毛状生长后再刷新；下一周期记录完整上升曲线');
      } else {
        result.state = '复活恢复期·待唤醒';
        result.level = 'info';
        result.reasons.push('冷藏/冷冻后的酵种通常需要回温并通过连续刷新恢复活性');
        result.actions.push('回温后连续规律喂养，直到至少连续两个周期表现稳定');
        result.actions.push('若多次刷新仍无反应，重点检查温度、面粉/水状态与污染迹象');
      }
      addTrace(result, 'STAGE.REVIVE', ['FERJOO-EXP-STAGE-001','CALVERT-2021'], `高度分支=${hv || 'missing'}`);
      return true;

    default:
      return false;
  }
}

function applyActivityJudgment(height, ratio, temp, result) {
  if (!height) {
    result.state = '信息不足';
    result.level = 'info';
    result.reasons.push('未提供高度状态，无法精确判断活性曲线位置');
    result.actions.push('补充喂养后体积变化：无变化 / 上升 / 翻倍 / 回落 / 液体层等');
    addTrace(result, 'INPUT.HEIGHT_MISSING', [], '高度缺失，停止活性细分');
    return;
  }
  const hv = height.value;
  switch (hv) {
    case 'none':
      result.state = '几乎无上升（需结合时间）';
      result.level = 'warn';
      result.reasons.push(`目前几乎无上升；只有结合喂养后经过时间，才能判断是否真的低于经验预期（约 ${result.expectedHours}）`);
      result.actions.push('补充喂养后已经过多久；未超过经验窗口前不要仅凭高度判定“活性不足”');
      break;
    case 'slight':
      result.state = '活性偏弱 / 进行中';
      result.level = 'warn';
      result.reasons.push('仅轻微上升，可能是活性偏弱，也可能只是观察时间尚短');
      if (temp.coef >= 1.8) result.reasons.push(`当前温度较低（${temp.label}），预期时间会被明显拉长`);
      result.actions.push('先观察至预期时间窗口，再决定是否需要调整比例或温度');
      result.actions.push('连续记录 2-3 个周期，比单次表现更可靠');
      break;
    case 'near':
      result.state = '健康（上升期）';
      result.level = 'ok';
      result.reasons.push('已接近翻倍，说明当前正在快速产气与上升');
      result.actions.push('继续观察至峰值；需要高活性时可在峰值附近使用或续种');
      break;
    case 'double':
      result.state = '巅峰（优先使用窗口）';
      result.level = 'ok';
      result.reasons.push('体积翻倍通常代表当前产气活性很强，处于优先使用窗口');
      result.actions.push('可用于面团，或按原比例刷新维持活性');
      result.actions.push('若继续放置，注意顶部变平、回落与酸味增强等过峰信号');
      break;
    case 'peak_plus':
      result.state = '强活 / 略过峰';
      result.level = 'ok';
      result.reasons.push('已超过翻倍并继续上升，显示活性强，同时可能正走向过峰阶段');
      result.actions.push('可直接使用；若追求更温和、可预测的风味，可先刷新一轮再用');
      result.actions.push('避免长时间继续放置导致营养耗尽与酒精/酸味积累');
      break;
    case 'over3':
      result.state = '过度膨胀';
      result.level = 'warn';
      result.reasons.push('膨胀 3 倍以上说明发酵非常强，已明显超出常规翻倍观察点，风味与结构更容易进入过峰状态');
      result.actions.push('尽快使用或刷新，不要继续长时间放置');
      result.actions.push('下轮可用更高喂养比例或降低温度来拉长峰值窗口');
      break;
    case 'fallen':
      result.state = '已过峰（回落）';
      result.level = 'warn';
      result.reasons.push('从高点回落说明可发酵底物被大量消耗，酸度与代谢产物继续累积');
      result.actions.push('需要更中性、强活的发酵表现时，先重新喂养至上升/峰值再用');
      result.actions.push('若配方刻意追求更酸的风味，可结合面团发酵计划决定是否使用');
      break;
    case 'hooch':
      result.state = '饥饿（出现液体层）';
      result.level = 'danger';
      result.reasons.push('表面液体层常见于长时间未喂养的酵种，表示需要刷新；仅凭液体层本身不等同于霉变');
      result.actions.push('先确认没有有色或绒毛状霉变，再倒掉或搅入液体并立即喂养');
      result.actions.push('若长期饥饿且酸味很重，可用 1:5:5 进行一次较强刷新');
      break;
    default:
      result.state = '未知状态';
      result.level = 'info';
      result.reasons.push('当前高度状态无法识别');
      result.actions.push('重新选择高度状态后再诊断');
  }
  addTrace(result, `ACTIVITY.${String(hv).toUpperCase()}`, ['FERJOO-EXP-STAGE-001'], `成熟期高度分支=${hv}`);
}

function applyElapsedContext(result, input, temp, ratioValue, tempResponse) {
  if (input.elapsedHours == null || input.elapsedHours === '') {
    if (result.stage === 'mature' && (result.height === 'none' || result.height === 'slight')) {
      result.state = '观察时间未知';
      result.level = 'info';
      result.reasons = ['尚未提供喂养后经过时间，当前高度不足以区分“观察尚早”和“活性偏慢”。'];
      result.actions = ['补充喂养时刻或已观察小时数，再与该比例、温度的经验窗口比较。','在确认超过窗口前，不要频繁补喂打断观察曲线。'];
      addTrace(result, 'TIME.UNKNOWN', ['FERJOO-EXP-TIME-001'], 'unknown 不等同于 0 小时');
    }
    return result;
  }
  const elapsed = Number(input.elapsedHours);
  if (!Number.isFinite(elapsed) || elapsed < 0) return result;
  result.elapsedHours = elapsed;
  const hv = result.height;

  const prior = priorPhysicalWindow(ratioValue, tempResponse);
  if (!prior.reliable) {
    addTrace(result, 'TIME.NOT_APPLICABLE_TO_RANGE', ['GANZLE-1998'], `timing.status=${result.timing ? result.timing.status : 'unknown'}`);
    return result;
  }

  // Key professional correction: do not call a starter "weak" before its expected window.
  if ((hv === 'none' || hv === 'slight') && elapsed < prior.min && result.stage === 'mature') {
    result.state = hv === 'none' ? '观察时间尚早' : '正常观察中';
    result.level = 'info';
    result.reasons = [
      `目前只经过 ${elapsed} 小时，还没有到该组合的经验最早翻倍时间（约 ${formatHours(prior.min)}）。`,
      hv === 'none' ? '此时几乎无变化并不能单独证明活性不足。' : '已经有轻微上升，先继续观察更有信息量。'
    ];
    result.actions = [
      `先观察到约 ${formatHours(prior.min)}，尽量不要中途再次喂养打断曲线。`,
      '记录顶部形态、气泡和体积；到预期窗口后再根据是否接近翻倍决定下一步。'
    ];
    addTrace(result, 'TIME.BEFORE_EXPECTED_MIN', ['FERJOO-EXP-TIME-001'], `elapsed=${elapsed}`);
  } else if ((hv === 'none' || hv === 'slight') && elapsed <= prior.max && result.stage === 'mature') {
    result.state = hv === 'none' ? '仍在经验观察窗口' : '正常观察中';
    result.level = 'info';
    result.reasons = [`目前经过 ${elapsed} 小时，仍在该组合的经验窗口（约 ${formatHours(prior.min)}–${formatHours(prior.max)}）。`];
    result.actions = ['继续观察到窗口上限，并记录顶部形态、气泡和体积；到时仍无明显上升再进入活性排查。'];
    addTrace(result, 'TIME.WITHIN_EXPECTED_RANGE', ['FERJOO-EXP-TIME-001'], `elapsed=${elapsed}`);
  } else if ((hv === 'none' || hv === 'slight') && elapsed > prior.max && result.stage === 'mature') {
    if (hv === 'none') {
      result.state = '活性偏慢';
      result.level = 'danger';
      result.reasons = [];
      result.actions = [];
      weakReasons({ ...temp, coef:temp.coef == null ? 1 : temp.coef }, result);
    }
    result.reasons.unshift(`已经观察 ${elapsed} 小时，超过该组合的经验翻倍上限（约 ${formatHours(prior.max)}），因此“偏慢”的判断更有依据。`);
    addTrace(result, 'TIME.AFTER_EXPECTED_MAX', ['FERJOO-EXP-TIME-001'], `elapsed=${elapsed}`);
  } else {
    addTrace(result, 'TIME.WITHIN_OR_NOT_APPLICABLE', ['FERJOO-EXP-TIME-001'], `elapsed=${elapsed}`);
  }
  return result;
}

function applyTemperatureContext(result, temp) {
  if (temp.value !== 't_gt32') return result;
  if (result.level === 'ok') result.level = 'warn';
  result.reasons.unshift('当前温度高于 32℃；不同酵种微生物对高温的反应并不一致，不能再简单按“越热越快”估算时间。');
  result.actions.unshift('先将酵种移至更稳定的 25–28℃ 环境，再从降温时点重新记录体积与时间。');
  addTrace(result, 'TEMP.HIGH_NONLINEAR', ['BRANDT-2004','VRANCKEN-2011','CALVERT-2021'], '停止 >32℃ 线性估时');
  return result;
}

function diagnoseStarter(input = {}) {
  const stage = resolve(input.stage, STAGES) || STAGES.find(s => s.value === 'mature');
  const ratio = resolve(input.ratio, RATIOS) || RATIOS.find(r => r.value === '1:1:1');
  const height = resolve(input.height, HEIGHTS);
  const temp = normalizeTemp(input.temp) || TEMPS.find(t => t.value === 't_25_28');

  // 数值预测只允许由 ratio / temperature / height / elapsed 决定；
  // stage / smell / color / pH / notes 不进入 predictDoublingTime。
  const timing = predictDoublingTime({
    ratio: ratio.value,
    temp,
    height: height ? height.value : null,
    elapsedHours: input.elapsedHours,
    temperatureSeries: input.temperatureSeries,
    heightSeries: input.heightSeries
  });

  const result = {
    stage:stage.value, stageLabel:stage.label,
    ratio:ratio.value, ratioLabel:ratio.label,
    height:height ? height.value : null, heightLabel:height ? height.label : null,
    temp:temp.value, tempLabel:temp.label, tempNote:temp.note,
    timing,
    expectedMin: timing.lowHours,
    expectedMax: timing.highHours,
    expectedReliable: timing.status !== 'temperature-out-of-domain' && timing.status !== 'trajectory-insufficient',
    expectedReason: timing.basis,
    expectedHours: timing.display,
    state:'', level:'info', reasons:[], actions:[], safety:[],
    ruleTrace:[], evidenceRefs:[], citations:[]
  };

  addTrace(result, 'TIMING.BIOCLOCK_PREDICTOR', ['GANZLE-1998'], `basis=${timing.basis};status=${timing.status}`);

  result.phAssessment = assessPh(input.ph);
  if (result.phAssessment) {
    addTrace(result, `PH.${result.phAssessment.band.toUpperCase().replace(/-/g, '_')}`, result.phAssessment.evidenceRefs, `pH=${result.phAssessment.value}`);
  }

  if (isContaminated(input)) {
    result.state = '已污染（不可使用）';
    result.level = 'danger';
    result.reasons.push('出现粉红/橙/黑/绿色斑点、绒毛状霉变，或腐臭/氨味/霉味等污染信号');
    result.actions.push('整罐酵种立即弃用，不要只刮除表面继续使用');
    result.actions.push('彻底清洁并消毒容器与工具，重新起种');
    result.safety.push('已出现明确污染信号，请不要继续使用或尝试挽救这罐酵种。');
    if (result.phAssessment) {
      result.phAssessment = {
        ...result.phAssessment,
        level:'warn',
        message:'已出现污染信号；pH 数值不能推翻整罐弃用结论。'
      };
    }
    addTrace(result, 'SAFETY.CONTAMINATION_DISCARD', ['CSU-STARTER-2025'], '污染信号覆盖其余规则');
    return finalizeResult(result);
  }

  if (!applyStageOverride(stage.value, height, temp, result)) {
    applyActivityJudgment(height, ratio, temp, result);
  }
  const tempResponse = getTemperatureResponse(getCurrentTemperature(temp, input.temperatureSeries));
  applyElapsedContext(result, input, temp, ratio.value, tempResponse);
  applyTemperatureContext(result, temp);
  addTrace(result, 'TIME.EMPIRICAL_RANGE', ['FERJOO-EXP-TIME-001'], `ratio=${ratio.value};temp=${temp.value}`);
  addTrace(result, 'UNCERTAINTY.DIVERSITY', ['LANDIS-2021','MINERVINI-2014'], '不同酵种与维护环境存在显著个体差异');
  return finalizeResult(result);
}

const LEVEL_LABEL = { ok:'良好', warn:'需注意', danger:'需处理', info:'观察' };

function formatAdvice(result) {
  const lines = ['酵种医生 · 诊断报告', ''];
  lines.push(`状态判定：${result.state}（${LEVEL_LABEL[result.level] || result.level}）`);
  lines.push(`当前阶段：${result.stageLabel}`);
  lines.push(`喂养比例：${result.ratioLabel}`);
  if (result.heightLabel) lines.push(`高度状态：${result.heightLabel}`);
  lines.push(`环境温度：${result.tempLabel}${result.tempNote ? `（${result.tempNote}）` : ''}`);
  lines.push(`预期翻倍时间：${result.expectedHours}`);
  if (result.elapsedHours != null) lines.push(`已观察：${result.elapsedHours} 小时`);
  lines.push('');
  if (result.reasons.length) {
    lines.push('原因分析：');
    result.reasons.forEach(r => lines.push(`- ${r}`));
    lines.push('');
  }
  if (result.actions.length) {
    lines.push('操作建议：');
    result.actions.forEach(a => lines.push(`- ${a}`));
    lines.push('');
  }
  if (result.safety.length) {
    lines.push('安全提醒：');
    result.safety.forEach(s => lines.push(`- ${s}`));
    lines.push('');
  }
  const publicCitations = (result.citations || []).filter(item => item && item.public !== false && item.type !== 'unresolved');
  if (publicCitations.length) {
    lines.push('参考文献：');
    publicCitations.forEach(item => {
      const meta = [item.authorsShort, item.source, item.year].filter(Boolean).join(' · ');
      const title = item.title || item.citation || item.key;
      lines.push(`- ${title}${meta ? `（${meta}）` : ''}`);
      if (item.url) lines.push(`  ${item.url}`);
    });
  }
  if (result.phAssessment) {
    lines.push('');
    lines.push(`pH 辅助：${result.phAssessment.value == null ? '输入无效' : result.phAssessment.value}；${result.phAssessment.message}`);
  }
  return lines.join('\n');
}

export { assessPh, diagnoseStarter, formatAdvice };
