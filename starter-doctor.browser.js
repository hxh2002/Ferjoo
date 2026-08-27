(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StarterDoctor = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const STAGES = [
    { value: 'start_d1', label: '起种初期（第 1-2 天）', aliases: ['第1天','第一天','第 1 天','第2天','第二天','第 2 天','刚起种','刚开始养','day1','day2','day 1','day 2'] },
    { value: 'start_active', label: '起种活跃期（第 3-5 天）', aliases: ['第3天','第三天','第 3 天','第4天','第四天','第 4 天','第5天','第五天','第 5 天','起种中','活跃期','day3','day4','day5'] },
    { value: 'start_stable', label: '起种稳定期（第 5-7 天）', aliases: ['第6天','第六天','第 6 天','第7天','第七天','第 7 天','稳定期','快成熟','接近成熟','day6','day7'] },
    { value: 'revive', label: '复活恢复期（冷藏/冷冻后）', aliases: ['复活','唤醒','恢复','解冻','从冰箱拿出来','冷藏后拿出来','刚拿出来'] },
    { value: 'fridge', label: '冷藏休眠期', aliases: ['冷藏','冰箱','休眠','冷藏保存','放冰箱','低温保存'] },
    { value: 'mature', label: '成熟期（日常喂养）', aliases: ['成熟','日常','日常喂养','老酵种','养好了','已成熟','稳定','mature'] }
  ];

  const RATIOS = [
    { value: '1:1:1', label: '1:1:1（标准）', aliases: ['1:1:1','1：1：1','一比一','1比1','1比1比1','标准比例','等量'] },
    { value: '1:2:2', label: '1:2:2（强活）', aliases: ['1:2:2','1：2：2','一比二','1比2','1比2比2'] },
    { value: '1:3:3', label: '1:3:3（温和/强活）', aliases: ['1:3:3','1：3：3','一比三','1比3','1比3比3'] },
    { value: '1:5:5', label: '1:5:5（重置降酸）', aliases: ['1:5:5','1：5：5','一比五','1比5','1比5比5','重置'] },
    { value: 'deep_reset', label: '超大比例（深度重置）', aliases: ['1:10:10','1：10：10','大比例重置','深度重置','超大比例'] },
    { value: '1:2:1', label: '1:2:1（硬种）', aliases: ['1:2:1','1：2：1','一比二比一','硬种','固态种','硬酵种','低水合种','含水量70','70%水合','stiff'] }
  ];

  const HEIGHTS = [
    { value: 'none', label: '几乎无变化（0-20%）', aliases: ['没变化','没有变化','不涨','没涨','没反应','没动静','不翻倍','没翻倍','没长','没长高','一点没涨','纹丝不动','毫无反应','无变化'] },
    { value: 'slight', label: '轻微上升（20-50%）', aliases: ['稍微涨','轻微','涨了一点','一点点','小幅','有点涨','涨了一点不多','微微上涨'] },
    { value: 'near', label: '接近翻倍（50-90%）', aliases: ['接近翻倍','快翻倍','差不多翻倍','快两倍','涨了七八成','涨了一半以上','50%','80%','90%'] },
    { value: 'double', label: '翻倍（100%，峰值）', aliases: ['正好翻倍','翻倍','两倍','涨到两倍','翻了一倍','涨了一倍','2倍','100%'] },
    { value: 'peak_plus', label: '2-3 倍（略过峰）', aliases: ['两倍多','2倍多','接近三倍','两到三倍','2到3倍','2-3倍','快三倍','三倍','涨到三倍'] },
    { value: 'over3', label: '3 倍以上（过度膨胀）', aliases: ['三倍以上','超过三倍','3倍以上','三倍多','3倍多','四五倍','涨到三倍以上','远超三倍'] },
    { value: 'fallen', label: '已回落（过峰）', aliases: ['回落','塌了','掉下来','下降','回缩','开始回落','过峰','涨过又掉','塌陷','缩回去','回落了'] },
    { value: 'hooch', label: '出现液体层（酒精层）', aliases: ['液体层','水层','酒精层','上层有水','析出液体','表面有水','出水','hooch','酒精味','上层清液','分泌液体'] }
  ];

  const TEMPS = [
    { value: 't_lt15', label: '<15℃', coef: 2.5, note: '近乎休眠', aliases: ['低于15度','十度','10度','11度','12度','13度','14度','很冷','零下'] },
    { value: 't_15_18', label: '15-18℃', coef: 2.2, note: '很慢', aliases: ['15度','16度','17度'] },
    { value: 't_18_22', label: '18-22℃', coef: 1.8, note: '稍凉', aliases: ['18度','19度','20度','21度'] },
    { value: 't_22_25', label: '22-25℃', coef: 1.3, note: '适中偏凉', aliases: ['22度','23度','24度'] },
    { value: 't_25_28', label: '25-28℃', coef: 1.0, note: '标准', aliases: ['25度','26度','27度','常温'] },
    { value: 't_28_32', label: '28-32℃', coef: 0.7, note: '偏快，酸度上升', aliases: ['28度','29度','30度','31度','32度','偏热'] },
    { value: 't_gt32', label: '>32℃', coef: 0.5, note: '高温风险，风味可能劣化', aliases: ['33度','34度','35度','36度','37度','38度','39度','40度','高温','很热'] }
  ];

  const RATIO_BASE_HOURS = {
    '1:1:1': { min: 4, max: 6 },
    '1:2:2': { min: 6, max: 8 },
    '1:3:3': { min: 8, max: 12 },
    '1:5:5': { min: 12, max: 24 },
    deep_reset: { min: 12, max: 36 },
    '1:2:1': { min: 8, max: 12 }
  };

  function matchValue(text, dimension) {
    const t = String(text || '').toLowerCase();
    let best = null;
    let bestLen = 0;
    for (const item of dimension) {
      for (const alias of item.aliases) {
        const a = String(alias).toLowerCase();
        if (a && t.includes(a) && a.length > bestLen) {
          best = item.value;
          bestLen = a.length;
        }
      }
    }
    return best;
  }

  function resolve(value, dimension) {
    if (value == null || value === '') return null;
    if (typeof value === 'object' && value.value) return dimension.find(d => d.value === value.value) || null;
    const s = String(value).trim();
    const direct = dimension.find(d => d.value === s);
    if (direct) return direct;
    const v = matchValue(s, dimension);
    return v ? dimension.find(d => d.value === v) : null;
  }

  function tempFromNumber(num) {
    let v;
    if (num < 15) v = 't_lt15';
    else if (num < 18) v = 't_15_18';
    else if (num < 22) v = 't_18_22';
    else if (num < 25) v = 't_22_25';
    else if (num < 28) v = 't_25_28';
    else if (num <= 32) v = 't_28_32';
    else v = 't_gt32';
    const hit = TEMPS.find(t => t.value === v);
    return { value:v, label:hit.label, coef:hit.coef, note:hit.note, num:Number(num) };
  }

  function normalizeTemp(input) {
    if (input == null || input === '') return null;
    if (typeof input === 'object' && input.value) {
      const hit = TEMPS.find(t => t.value === input.value);
      return hit ? { value:hit.value, label:hit.label, coef:hit.coef, note:hit.note } : null;
    }
    if (typeof input === 'number') return tempFromNumber(input);
    const text = String(input).trim();
    if (/^-?\d+(\.\d+)?$/.test(text)) return tempFromNumber(Number(text));
    const direct = TEMPS.find(t => t.value === text);
    if (direct) return { value:direct.value, label:direct.label, coef:direct.coef, note:direct.note };
    let m = text.match(/(室温|温度|气温)?\s*(-?\d+(?:\.\d+)?)\s*(?:度|℃|°C|°c|°)/);
    if (!m) m = text.match(/(室温|温度|气温)\s*(?:是|为|约|大概|在|有)?\s*(-?\d+(?:\.\d+)?)/);
    if (m) {
      const num = Number(m[2]);
      if (num >= -10 && num <= 60) return tempFromNumber(num);
    }
    const v = matchValue(text, TEMPS);
    if (v) {
      const hit = TEMPS.find(t => t.value === v);
      return { value:hit.value, label:hit.label, coef:hit.coef, note:hit.note };
    }
    return null;
  }

  const normalizeStage = v => resolve(v, STAGES);
  const normalizeRatio = v => resolve(v, RATIOS);
  const normalizeHeight = v => resolve(v, HEIGHTS);

  function parseStarterInput(text) {
    const t = String(text || '');
    const out = {};
    const stage = matchValue(t, STAGES);
    if (stage) out.stage = stage;
    const ratio = matchValue(t, RATIOS);
    if (ratio) out.ratio = ratio;
    const height = matchValue(t, HEIGHTS);
    if (height) out.height = height;
    const temp = normalizeTemp(t);
    if (temp) out.temp = temp.num != null ? temp.num : temp.value;
    const hm = t.match(/(?:喂养后|过了|经过|已经)?\s*(\d+(?:\.\d+)?)\s*(?:小时|h|hr)/i);
    if (hm) out.elapsedHours = Number(hm[1]);
    const pm = t.match(/p\s*h\s*(?:是|为|约|大概|:|：)?\s*(\d(?:\.\d+)?)/i);
    if (pm) out.ph = Number(pm[1]);
    return out;
  }

  function isContaminated(input) {
    const smell = String(input.smell || '');
    const color = String(input.color || '');
    const note = String(input.notes || '');
    const badSmell = /腐臭|氨味|霉味|馊味/.test(smell + note);
    const badColor = /粉红|橙|黑|绿|发霉|霉斑|长毛|变色/.test(color + note);
    return badSmell || badColor;
  }

  function expectedRange(ratioValue, coef) {
    const base = RATIO_BASE_HOURS[ratioValue] || RATIO_BASE_HOURS['1:1:1'];
    return {
      min: Math.round(base.min * coef * 10) / 10,
      max: Math.round(base.max * coef * 10) / 10
    };
  }
  function formatHours(h) {
    if (h < 1) return `${Math.round(h * 60)} 分钟`;
    return `${h} 小时`;
  }
  function expectedHours(ratioValue, coef) {
    const r = expectedRange(ratioValue, coef);
    return `${formatHours(r.min)}~${formatHours(r.max)}`;
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
        }
        result.actions.push('保持容器清洁并松盖，维持稳定温暖环境后观察 24 小时');
        result.actions.push('记录气泡、气味与体积变化，不要品尝生酵种');
        result.actions.push('次日继续按 1:1:1 的固定节奏喂养');
        return true;

      case 'start_active':
        if (hv === 'none' || hv === 'slight') {
          result.state = '起种活跃期·反应偏弱';
          result.level = 'warn';
          result.reasons.push('第 3-5 天通常应逐步出现更多气泡与体积增长；持续偏弱时需检查温度、水和面粉状态');
          result.actions.push('检查环境是否至少约 20℃；需要加速时可移入 25-28℃');
          result.actions.push('确认用水与面粉新鲜、容器清洁，继续规律喂养');
        } else {
          result.state = '起种活跃期·进展正常';
          result.level = 'ok';
          result.reasons.push('气泡与体积增长说明菌群正在建立，现阶段趋势正常');
        }
        result.actions.push('保持规律喂养，尽量固定比例、温度和观察时间');
        result.actions.push('记录气味从刺激性向更稳定的酸香转变');
        return true;

      case 'start_stable':
        if (hv === 'double' || hv === 'peak_plus') {
          result.state = '起种完成·接近成熟';
          result.level = 'ok';
          result.reasons.push('喂养后能够稳定明显上升或翻倍，说明已接近可用于日常维护的活性水平');
          result.actions.push('可转入日常喂养或冷藏保存，并继续用重复周期确认稳定性');
          result.actions.push('做面包前以实际发酵表现为准，不把单一“浮水试验”作为唯一活性标准');
        } else {
          result.state = '起种稳定期·尚未成熟';
          result.level = 'warn';
          result.reasons.push('第 5-7 天仍无稳定明显上升时，需要继续排查温度、用水、面粉与喂养节奏');
          result.actions.push('维持稳定环境并继续规律喂养 2-3 天');
          result.actions.push('若出现异色、绒毛状霉变或明显腐败异味，整罐弃用重起');
        }
        return true;

      case 'fridge':
        result.state = '冷藏休眠期';
        result.level = 'info';
        result.reasons.push('冷藏状态下发酵活性会显著放慢，无明显上升通常不代表失活');
        if (hv === 'hooch') {
          result.level = 'warn';
          result.reasons.push('冷藏期出现较多液体层，常提示已经消耗较多营养、需要刷新');
          result.actions.push('确认无霉变后，可倒掉或搅入液体并喂养，再按维护计划冷藏');
        }
        result.actions.push('按你的烘焙频率制定固定的冷藏喂养周期；使用前先恢复到稳定上升状态');
        return true;

      case 'revive':
        if (hv === 'double' || hv === 'peak_plus') {
          result.state = '复活恢复期·已恢复';
          result.level = 'ok';
          result.reasons.push('已恢复到明显上升/翻倍活性，可回到正常使用节奏');
          result.actions.push('继续一次正常喂养或按配方需要使用');
        } else {
          result.state = '复活恢复期·待唤醒';
          result.level = 'info';
          result.reasons.push('冷藏/冷冻后的酵种通常需要回温并通过连续刷新恢复活性');
          result.actions.push('回温后连续规律喂养，直到至少连续两个周期表现稳定');
          result.actions.push('若多次刷新仍无反应，重点检查温度、面粉/水状态与污染迹象');
        }
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
      return;
    }
    const hv = height.value;
    switch (hv) {
      case 'none':
        result.state = '活性不足';
        result.level = 'danger';
        result.reasons.push(`在完整观察窗口内仍几乎无上升，会低于该比例与温度的经验预期（约 ${result.expectedHours}）`);
        weakReasons(temp, result);
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
    }
  }

  function applyElapsedContext(result, input) {
    const elapsed = Number(input.elapsedHours);
    if (!Number.isFinite(elapsed) || elapsed < 0) return result;
    result.elapsedHours = elapsed;
    const hv = result.height;

    // Key professional correction: do not call a starter "weak" before its expected window.
    if ((hv === 'none' || hv === 'slight') && elapsed < result.expectedMin && result.stage === 'mature') {
      result.state = hv === 'none' ? '观察时间尚早' : '正常观察中';
      result.level = 'info';
      result.reasons = [
        `目前只经过 ${elapsed} 小时，还没有到该组合的经验最早翻倍时间（约 ${formatHours(result.expectedMin)}）。`,
        hv === 'none' ? '此时几乎无变化并不能单独证明活性不足。' : '已经有轻微上升，先继续观察更有信息量。'
      ];
      result.actions = [
        `先观察到约 ${formatHours(result.expectedMin)}，尽量不要中途再次喂养打断曲线。`,
        '记录顶部形态、气泡和体积；到预期窗口后再根据是否接近翻倍决定下一步。'
      ];
    } else if ((hv === 'none' || hv === 'slight') && elapsed > result.expectedMax && result.stage === 'mature') {
      result.reasons.unshift(`已经观察 ${elapsed} 小时，超过该组合的经验翻倍上限（约 ${formatHours(result.expectedMax)}），因此“偏慢”的判断更有依据。`);
    }
    return result;
  }

  function diagnoseStarter(input = {}) {
    const stage = resolve(input.stage, STAGES) || STAGES.find(s => s.value === 'mature');
    const ratio = resolve(input.ratio, RATIOS) || RATIOS.find(r => r.value === '1:1:1');
    const height = resolve(input.height, HEIGHTS);
    const temp = normalizeTemp(input.temp) || TEMPS.find(t => t.value === 't_25_28');
    const range = expectedRange(ratio.value, temp.coef);

    const result = {
      stage:stage.value, stageLabel:stage.label,
      ratio:ratio.value, ratioLabel:ratio.label,
      height:height ? height.value : null, heightLabel:height ? height.label : null,
      temp:temp.value, tempLabel:temp.label, tempNote:temp.note,
      expectedMin:range.min, expectedMax:range.max,
      expectedHours:expectedHours(ratio.value, temp.coef),
      state:'', level:'info', reasons:[], actions:[], safety:[]
    };

    if (isContaminated(input)) {
      result.state = '已污染（不可使用）';
      result.level = 'danger';
      result.reasons.push('出现粉红/橙/黑/绿色斑点、绒毛状霉变，或腐臭/氨味/霉味等污染信号');
      result.actions.push('整罐酵种立即弃用，不要只刮除表面继续使用');
      result.actions.push('彻底清洁并消毒容器与工具，重新起种');
      result.safety.push('污染安全规则优先于活性、高度、比例和温度判断。');
      return result;
    }

    if (!applyStageOverride(stage.value, height, temp, result)) {
      applyActivityJudgment(height, ratio, temp, result);
    }
    return applyElapsedContext(result, input);
  }

  const LEVEL_LABEL = { ok:'良好', warn:'需注意', danger:'需处理', info:'观察' };

  function formatAdvice(result) {
    const lines = ['酵种医生 · 诊断报告', ''];
    lines.push(`状态判定：${result.state}（${LEVEL_LABEL[result.level] || result.level}）`);
    lines.push(`当前阶段：${result.stageLabel}`);
    lines.push(`喂养比例：${result.ratioLabel}`);
    if (result.heightLabel) lines.push(`高度状态：${result.heightLabel}`);
    lines.push(`环境温度：${result.tempLabel}`);
    lines.push(`预期翻倍时间：约 ${result.expectedHours}`);
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
    }
    return lines.join('\n');
  }

  return {
    STAGES, RATIOS, HEIGHTS, TEMPS, RATIO_BASE_HOURS,
    normalizeStage, normalizeRatio, normalizeHeight, normalizeTemp,
    parseStarterInput, diagnoseStarter, formatAdvice, expectedRange
  };
});
