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
    { value: 't_gt32', label: '>32℃', coef: null, note: '高温风险，不做线性估时', aliases: ['33度','34度','35度','36度','37度','38度','39度','40度','高温','很热'] }
  ];

  const RATIO_BASE_HOURS = {
    '1:1:1': { min: 4, max: 6 },
    '1:2:2': { min: 6, max: 8 },
    '1:3:3': { min: 8, max: 12 },
    '1:5:5': { min: 12, max: 24 },
    deep_reset: { min: 12, max: 36 },
    '1:2:1': { min: 8, max: 12 }
  };

  // 26℃ 参考温度下，尚未个体校准的酵种达到首次 2x 所需的“先验等效生物小时”。
  // 这是项目经验先验，不是论文原始数值；论文只负责修正温度响应方式。
  const RATIO_PRIOR_BIO_HOURS_26C = {
    '1:1:1': 5,
    '1:2:2': 7,
    '1:3:3': 10,
    '1:5:5': 18,
    deep_reset: 24,
    '1:2:1': 10
  };

  // Runtime citations are deliberately small. The complete, reviewable source
  // library lives under research/; these records are the subset needed to make
  // every diagnosis traceable without a network request.
  const EVIDENCE_CATALOG = {
    'CSU-STARTER-2025': {
      type: 'official-extension-guidance',
      public: true,
      kind: '官方指南',
      authorsShort: 'CSU Extension',
      source: 'FoodSmart Colorado',
      year: '2025',
      title: 'Sourdough Starter Best Practices',
      citation: 'Colorado State University Extension. Sourdough Starter Best Practices. Reviewed October 2025.',
      url: 'https://extension.colostate.edu/resource/sourdough-starter-best-practices/',
      supports: 'pH 4.6 as an acidification reference; discard colored/fuzzy mold; an alcoholic liquid layer alone can be a fermentation by-product.',
      displayNote: '用于判断霉变、酒精液层，以及家庭酵种的基础安全边界。'
    },
    'FDA-RAW-FLOUR-2023': {
      type: 'regulatory-guidance',
      public: true,
      kind: '官方指南',
      authorsShort: 'U.S. FDA',
      source: 'Food Safety',
      year: '2023',
      title: 'Flour Is a Raw Food and Other Safety Facts',
      citation: 'U.S. Food and Drug Administration. Flour Is a Raw Food and Other Safety Facts. 2023.',
      url: 'https://www.fda.gov/consumers/consumer-updates/flour-raw-food-and-other-safety-facts',
      supports: 'Raw flour, dough, and starter should not be tasted; baking/cooking is the microbial kill step.',
      displayNote: '说明面粉属于生食材，生酵种不应直接品尝，充分烘烤才是最终加热步骤。'
    },
    'BRANDT-2004': {
      type: 'primary-research',
      public: true,
      kind: '原始研究',
      authorsShort: 'Brandt et al.',
      source: 'European Food Research and Technology',
      year: '2004',
      title: 'Effects of process parameters on growth and metabolism of Lactobacillus sanfranciscensis and Candida humilis during rye sourdough fermentation',
      citation: 'Brandt MJ, Hammes WP, Gänzle MG. Effects of process parameters on growth and metabolism of Lactobacillus sanfranciscensis and Candida humilis during rye sourdough fermentation. Eur Food Res Technol. 2004;218:333–338. doi:10.1007/s00217-003-0867-0.',
      url: 'https://doi.org/10.1007/s00217-003-0867-0',
      supports: 'In the studied rye sourdough culture, C. humilis growth was optimal near 28°C and inhibited at 35°C; temperature effects differ by organism.',
      displayNote: '说明不同酵种微生物对温度的反应并不相同，高温不能简单理解为“越热越快”。'
    },
    'VRANCKEN-2011': {
      type: 'primary-research',
      public: true,
      kind: '原始研究',
      authorsShort: 'Vrancken et al.',
      source: 'Applied and Environmental Microbiology',
      year: '2011',
      title: 'Influence of Temperature and Backslopping Time on the Microbiota of a Type I Propagated Laboratory Wheat Sourdough Fermentation',
      citation: 'Vrancken G, Rimaux T, Weckx S, Leroy F, De Vuyst L. Influence of Temperature and Backslopping Time on the Microbiota of a Type I Propagated Laboratory Wheat Sourdough Fermentation. Appl Environ Microbiol. 2011;77(8):2716–2726. doi:10.1128/AEM.02470-10.',
      url: 'https://doi.org/10.1128/AEM.02470-10',
      supports: 'Temperature and backslopping time changed the dominant microbial community in serially propagated wheat sourdough.',
      displayNote: '显示温度和回接间隔会改变酵种中的优势微生物组成。'
    },
    'CALVERT-2021': {
      type: 'peer-reviewed-review',
      public: true,
      kind: '综述',
      authorsShort: 'Calvert et al.',
      source: 'PeerJ',
      year: '2021',
      title: 'A review of sourdough starters: ecology, practices, and sensory quality with applications for baking and recommendations for future research',
      citation: 'Calvert MD et al. A review of sourdough starters: ecology, practices, and sensory quality with applications for baking and recommendations for future research. PeerJ. 2021;9:e11389. doi:10.7717/peerj.11389.',
      url: 'https://doi.org/10.7717/peerj.11389',
      supports: 'Temperature, hydration, ingredients, and refeeding practices can change microbial ecology, activity, metabolites, and sensory outcomes.',
      displayNote: '综述了温度、含水量、原料与维护方式如何共同影响酵种表现。'
    },
    'MCKENNEY-2023': {
      type: 'primary-research',
      public: true,
      kind: '原始研究',
      authorsShort: 'McKenney et al.',
      source: 'PeerJ',
      year: '2023',
      title: 'Sourdough starters exhibit similar succession patterns but develop flour-specific climax communities',
      citation: 'McKenney EA et al. Sourdough starters exhibit similar succession patterns but develop flour-specific climax communities. PeerJ. 2023;11:e16163. doi:10.7717/peerj.16163.',
      url: 'https://doi.org/10.7717/peerj.16163',
      supports: 'Forty starters from ten flours followed succession over 14 days; maturity markers were protocol-dependent and flour-specific differences remained.',
      displayNote: '支持“新起种会经历阶段性变化”，且不同面粉最终表现仍可能不同。'
    },
    'LANDIS-2021': {
      type: 'primary-research',
      public: true,
      kind: '原始研究',
      authorsShort: 'Landis et al.',
      source: 'eLife',
      year: '2021',
      title: 'The diversity and function of sourdough starter microbiomes',
      citation: 'Landis EA et al. The diversity and function of sourdough starter microbiomes. eLife. 2021;10:e61644. doi:10.7554/eLife.61644.',
      url: 'https://doi.org/10.7554/eLife.61644',
      supports: 'Five hundred household starters showed substantial microbiome and functional diversity, including variation in rise rate and aroma.',
      displayNote: '说明不同家庭酵种的膨胀速度和微生物组成差异很大，因此连续观察比单次阈值更可靠。'
    },
    'DE-VUYST-2009': {
      type: 'peer-reviewed-review',
      public: true,
      kind: '综述',
      authorsShort: 'De Vuyst et al.',
      source: 'Food Microbiology',
      year: '2009',
      title: 'Biodiversity, ecological determinants, and metabolic exploitation of sourdough microbiota',
      citation: 'De Vuyst L, Vrancken G, Ravyts F, Rimaux T, Weckx S. Biodiversity, ecological determinants, and metabolic exploitation of sourdough microbiota. Food Microbiol. 2009;26(7):666–675. doi:10.1016/j.fm.2009.07.012.',
      url: 'https://doi.org/10.1016/j.fm.2009.07.012',
      supports: 'Sourdough ecology depends on flour, process conditions, microbial interactions, pH, temperature, hydration, and refreshment practices.',
      displayNote: '概述面粉、温度、含水量、刷新方式和微生物互作如何共同塑造酵种生态。'
    },
    'MINERVINI-2014': {
      type: 'peer-reviewed-review',
      public: true,
      kind: '综述',
      authorsShort: 'Minervini et al.',
      source: 'International Journal of Food Microbiology',
      year: '2014',
      title: 'Ecological parameters influencing microbial diversity and stability of traditional sourdough',
      citation: 'Minervini F, De Angelis M, Di Cagno R, Gobbetti M. Ecological parameters influencing microbial diversity and stability of traditional sourdough. Int J Food Microbiol. 2014;171:136–146. doi:10.1016/j.ijfoodmicro.2013.11.021.',
      url: 'https://doi.org/10.1016/j.ijfoodmicro.2013.11.021',
      supports: 'Fermentation time, temperature, inoculum, flour composition, and house microbiota can affect diversity and stability; constant process settings do not guarantee identical microbiota.',
      displayNote: '支持把时间、温度、面粉与维护环境一起理解，而不是把单一数值当成固定标准。'
    },
    'GANZLE-2014': {
      type: 'peer-reviewed-review',
      public: true,
      kind: '综述',
      authorsShort: 'Gänzle',
      source: 'Food Microbiology',
      year: '2014',
      title: 'Enzymatic and bacterial conversions during sourdough fermentation',
      citation: 'Gänzle MG. Enzymatic and bacterial conversions during sourdough fermentation. Food Microbiol. 2014;37:2–10. doi:10.1016/j.fm.2013.04.007.',
      url: 'https://doi.org/10.1016/j.fm.2013.04.007',
      supports: 'Microbial metabolism, cereal enzymes, acidification, oxygen consumption, and substrate availability interact during sourdough fermentation.',
      displayNote: '用于理解发酵并非单一“酵母速度”问题，而是微生物代谢与面粉环境共同作用。'
    },
    'GANZLE-1998': {
      type: 'primary-research',
      public: true,
      kind: '原始研究',
      authorsShort: 'Gänzle et al.',
      source: 'Applied and Environmental Microbiology',
      year: '1998',
      title: 'Modeling of Growth of Lactobacillus sanfranciscensis and Candida milleri in Response to Process Parameters of Sourdough Fermentation',
      citation: 'Gänzle MG, Ehmann M, Hammes WP. Modeling of Growth of Lactobacillus sanfranciscensis and Candida milleri in Response to Process Parameters of Sourdough Fermentation. Appl Environ Microbiol. 1998;64(7):2616–2623.',
      url: null,
      supports: '支持温度响应非线性；支持 C. milleri 最适温度约 27℃；支持接近 35–36℃ 的高温抑制保护边界；不支持直接声称家庭酵种固定翻倍小时数。',
      displayNote: '把论文温度响应当作相对生物时钟速度，而不是把菌株生长率直接当成罐中高度翻倍时间。'
    },
    'FERJOO-EXP-TIME-001': {
      type: 'brand-experience-needs-calibration',
      public: false,
      citation: 'Dr. Ferjoo internal rule prior: ratio-specific peak-time windows at 25–28°C.',
      url: null,
      supports: 'The displayed ratio × temperature time window is an empirical prior, not a universal literature constant.'
    },
    'FERJOO-EXP-STAGE-001': {
      type: 'brand-experience-needs-calibration',
      public: false,
      citation: 'Dr. Ferjoo internal rule prior: stage and rise-state interpretation.',
      url: null,
      supports: 'Stage-specific narrative and action wording pending prospective curve calibration.'
    }
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
      if (!hit) return null;
      const normalized = { value:hit.value, label:hit.label, coef:hit.coef, note:hit.note };
      if (input.num != null && Number.isFinite(Number(input.num))) normalized.num = Number(input.num);
      return normalized;
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
    if (temp) {
      out.temp = temp.num != null ? temp.num : temp.value;
      out.tempBucket = temp.value;
      if (temp.num != null) out.tempC = temp.num;
    }
    const hm = t.match(/(?:喂养后|喂后|过了|经过|已经|已)?\s*(\d+(?:\.\d+)?)\s*(?:小时|hours?|hrs?|h)(?![a-z])/i);
    if (hm) out.elapsedHours = Number(hm[1]);
    const pm = t.match(/p\s*h\s*(?:是|为|约|大概|:|：)?\s*(\d(?:\.\d+)?)/i);
    if (pm) out.ph = Number(pm[1]);
    const colorSignals = [
      [/粉红/, '粉红'], [/橙(?:色)?(?:斑|点|层)/, '橙色'], [/黑(?:色)?(?:斑|点|霉)/, '黑色斑点'],
      [/绿(?:色)?(?:斑|点|霉)/, '绿色斑点'], [/发霉|霉斑|长毛|绒毛/, '发霉长毛']
    ];
    const smellSignals = [[/腐臭|馊味/, '腐臭'], [/氨味/, '氨味'], [/霉味/, '霉味']];
    for (const [pattern, value] of colorSignals) {
      if (isContaminated({ notes:t }) && pattern.test(t)) { out.color = value; break; }
    }
    for (const [pattern, value] of smellSignals) {
      if (isContaminated({ notes:t }) && pattern.test(t)) { out.smell = value; break; }
    }
    if (out.color || out.smell) out.contaminationNotes = t;
    return out;
  }

  function isContaminated(input = {}) {
    const smell = String(input.smell || '');
    const color = String(input.color || '');
    const note = String(input.notes || '');
    const negation = '(?:没有|并无|无|未见|未发现|不是|不含)';
    const hasUnnegated = (text, signal) => {
      if (!signal.test(text)) return false;
      const source = signal.source;
      const negatedSignal = new RegExp(`${negation}[^，。；;]{0,12}(?:${source})`);
      return !negatedSignal.test(text);
    };
    const badSmell = hasUnnegated(smell, /腐臭|氨味|霉味|馊味/) || hasUnnegated(note, /腐臭|氨味|霉味|馊味/);
    const badColor = hasUnnegated(color, /粉红|橙色|黑色|绿色|发霉|霉斑|长毛|绒毛/) ||
      hasUnnegated(note, /粉红(?:色)?(?:斑|点|层)|橙(?:色)?(?:斑|点|层)|黑(?:色)?(?:斑|点|霉)|绿(?:色)?(?:斑|点|霉)|发霉|霉斑|长毛|绒毛/);
    return badSmell || badColor;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function formatHours(h) {
    if (h == null) return null;
    if (h < 1) return `${Math.round(h * 60)} 分钟`;
    return `${h} 小时`;
  }

  function roundDisplay(hours) {
    if (hours == null) return null;
    if (hours < 6) return Math.round(hours * 2) / 2;
    if (hours <= 24) return Math.round(hours);
    return Math.round(hours / 2) * 2;
  }

  // Gänzle, Ehmann & Hammes (1998) Table 2, Model 1a, C. milleri LTH H198.
  // 只用温度响应形状作为“相对生物时钟速度”，不做罐体高度动力学声明。
  function rawPaperYeastRate(tempC) {
    const Tmax = 35.9;
    const aPrime = 0.029;
    const b = 3.0;
    const c = 0.34;

    const x = Tmax - tempC;
    if (x <= 0) return 0;
    return aPrime * Math.pow(x, b) * Math.exp(-c * x);
  }

  const PAPER_RATE_AT_26 = rawPaperYeastRate(26);

  function getTemperatureResponse(tempC) {
    if (!Number.isFinite(tempC)) {
      return { factor: 1, reliable: false, confidencePenalty: 0.10, reason: 'temperature-defaulted-to-26' };
    }
    if (tempC <= 8) {
      return { factor: null, reliable: false, confidencePenalty: 0.30, reason: 'below-paper-practical-domain' };
    }
    if (tempC >= 35) {
      return { factor: null, reliable: false, confidencePenalty: 0.35, reason: 'high-temperature-yeast-inhibition-zone' };
    }
    const factor = rawPaperYeastRate(tempC) / PAPER_RATE_AT_26;
    return {
      factor: Math.max(0.03, Math.min(1.05, factor)),
      reliable: tempC >= 18 && tempC <= 32,
      confidencePenalty: (tempC >= 18 && tempC <= 32) ? 0 : 0.18,
      reason: (tempC >= 18 && tempC <= 32)
        ? 'paper-temperature-model'
        : 'paper-temperature-model-low-confidence-edge'
    };
  }

  function getRatioPriorBioHours(ratio) {
    return RATIO_PRIOR_BIO_HOURS_26C[ratio] != null ? RATIO_PRIOR_BIO_HOURS_26C[ratio] : RATIO_PRIOR_BIO_HOURS_26C['1:1:1'];
  }

  function integrateTemperatureSeries(samples) {
    let bioHours = 0;
    if (!Array.isArray(samples) || samples.length < 2) return 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const fa = a && Number.isFinite(Number(a.tempC)) ? getTemperatureResponse(Number(a.tempC)).factor : null;
      const fb = b && Number.isFinite(Number(b.tempC)) ? getTemperatureResponse(Number(b.tempC)).factor : null;
      if (fa == null || fb == null) continue;
      const dt = Number(b.tHours) - Number(a.tHours);
      if (!Number.isFinite(dt) || dt < 0) continue;
      bioHours += ((fa + fb) / 2) * dt;
    }
    return bioHours;
  }

  function detectFirstDoubleCrossing(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return null;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (a.ratio < 2 && b.ratio >= 2) {
        const f = (2 - a.ratio) / (b.ratio - a.ratio);
        return { tHours: Number(a.tHours) + f * (Number(b.tHours) - Number(a.tHours)) };
      }
    }
    return null;
  }

  function geometricBlend(prior, observed, weight) {
    return Math.exp((1 - weight) * Math.log(prior) + weight * Math.log(observed));
  }

  function clampObservedBioHours(value, prior) {
    return Math.max(prior * 0.40, Math.min(prior * 4.00, value));
  }

  function noRiseWeight({ elapsedHours, priorPhysicalHours }) {
    const lateness = elapsedHours / Math.max(priorPhysicalHours, 0.1);
    return clamp((lateness - 0.60) / 1.40, 0, 0.70);
  }

  const BUCKET_TEMP_REPRESENTATIVE = {
    t_lt15: 12, t_15_18: 17, t_18_22: 20, t_22_25: 24,
    t_25_28: 26, t_28_32: 30, t_gt32: 35
  };

  function extractTemp(tempOrCoef) {
    if (typeof tempOrCoef === 'number' && Number.isFinite(tempOrCoef)) return tempOrCoef;
    if (typeof tempOrCoef === 'string') {
      const trimmed = tempOrCoef.trim();
      if (trimmed === '') return null;
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n;
      if (BUCKET_TEMP_REPRESENTATIVE[trimmed] != null) return BUCKET_TEMP_REPRESENTATIVE[trimmed];
      return null;
    }
    if (tempOrCoef && typeof tempOrCoef === 'object') {
      if (tempOrCoef.num != null && Number.isFinite(Number(tempOrCoef.num))) return Number(tempOrCoef.num);
      if (tempOrCoef.value && BUCKET_TEMP_REPRESENTATIVE[tempOrCoef.value] != null) {
        return BUCKET_TEMP_REPRESENTATIVE[tempOrCoef.value];
      }
    }
    return null;
  }

  function getCurrentTemperature(temp, temperatureSeries) {
    if (Array.isArray(temperatureSeries) && temperatureSeries.length > 0) {
      const last = temperatureSeries[temperatureSeries.length - 1];
      const n = last && last.tempC;
      if (Number.isFinite(Number(n))) return Number(n);
    }
    return extractTemp(temp);
  }

  function sanitizeElapsed(elapsedHours) {
    if (elapsedHours == null || elapsedHours === '') return null;
    const n = Number(elapsedHours);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  function priorPhysicalWindow(ratioValue, tempResponse) {
    const base = RATIO_BASE_HOURS[ratioValue] || RATIO_BASE_HOURS['1:1:1'];
    const factor = tempResponse ? tempResponse.factor : null;
    if (factor == null) {
      return { min: null, max: null, reliable: false, reason: 'temperature-out-of-domain' };
    }
    return {
      min: base.min / factor,
      max: base.max / factor,
      reliable: true,
      reason: 'ratio-temp-prior'
    };
  }

  function computeUncertainty({ height, ratio, tempResponse }) {
    let u = 0.18;
    if (height == null) u += 0.15;
    else if (height === 'none') u += 0.18;
    else if (height === 'slight') u += 0.12;
    else if (height === 'near') u += 0.06;
    else if (height === 'double') u += 0.03;
    if (tempResponse && tempResponse.reliable === false) u += 0.18;
    if (ratio === 'deep_reset' || ratio === '1:2:1') u += 0.08;
    return clamp(u, 0.18, 0.48);
  }

  function inferConfidence({ status, basis, height, tempResponse, elapsed }) {
    if (basis === 'sensor-crossing') return 'high';
    if (height === 'double' || height === 'peak_plus' || height === 'over3') return 'medium';
    if (status === 'crossed' || status === 'crossed-before-now') return 'medium';
    if (height === 'near' && elapsed != null && tempResponse && tempResponse.reliable) return 'medium';
    return 'low';
  }

  function buildDisplay({ status, totalHours, remainingHours, low, high, elapsed }) {
    switch (status) {
      case 'crossed':
        return `约 ${roundDisplay(totalHours)} 小时`;
      case 'crossed-before-now':
        return `本轮已在 ${roundDisplay(elapsed)} 小时以内达到翻倍`;
      case 'trajectory-insufficient':
        return '已回落；单次高度无法反推出本轮首次翻倍时刻';
      case 'temperature-out-of-domain':
        return '当前温度超出有效域，不提供精确估时';
      case 'forecast':
      default: {
        // 有已观察时长时，用户关心的是“从现在起还剩多久”，而不是“本轮总共多久”。
        if (remainingHours != null && Number.isFinite(remainingHours)) {
          if (remainingHours < 0.5) return '预计即将翻倍';
          return `预计还需约 ${roundDisplay(remainingHours)} 小时`;
        }
        if (low != null && high != null && Number.isFinite(low) && Number.isFinite(high)) {
          return `约 ${roundDisplay(low)}–${roundDisplay(high)} 小时`;
        }
        if (totalHours != null && Number.isFinite(totalHours)) {
          return `约 ${roundDisplay(totalHours)} 小时`;
        }
        return '无法提供精确翻倍时间';
      }
    }
  }

  function buildForecast({ ratio, height, tempResponse, totalHours, remainingHours, elapsed, basis, bioHoursElapsed, status }) {
    status = status || 'forecast';
    const confidence = inferConfidence({ status, basis, height, tempResponse, elapsed });
    let low = null;
    let high = null;
    if (totalHours != null && Number.isFinite(totalHours)) {
      const u = computeUncertainty({ height, ratio, tempResponse });
      low = totalHours * (1 - u);
      high = totalHours * (1 + u);
      if (status === 'forecast' && elapsed != null) low = Math.max(low, elapsed);
    }
    const display = buildDisplay({ status, totalHours, remainingHours, low, high, elapsed });
    return {
      totalHours: totalHours == null ? null : totalHours,
      remainingHours: remainingHours == null ? null : remainingHours,
      lowHours: low,
      highHours: high,
      confidence,
      status,
      basis,
      bioHoursElapsed: bioHoursElapsed == null ? null : bioHoursElapsed,
      tempFactorNow: tempResponse ? tempResponse.factor : null,
      display,
      trace: [
        { id: `timing:${basis}`, note: `totalHours=${totalHours == null ? 'null' : Number(totalHours).toFixed(2)}; status=${status}` }
      ]
    };
  }

  function makeObservedCrossingResult(crossing, bioHoursElapsed) {
    const totalHours = crossing.tHours;
    return {
      totalHours,
      remainingHours: 0,
      lowHours: totalHours * 0.9,
      highHours: totalHours * 1.1,
      confidence: 'high',
      status: 'crossed',
      basis: 'sensor-crossing',
      bioHoursElapsed,
      tempFactorNow: null,
      display: `约 ${roundDisplay(totalHours)} 小时`,
      trace: [{ id: 'timing:sensor-crossing', note: `首次 2x 检测于 ${Number(totalHours).toFixed(2)}h` }]
    };
  }

  function predictDoublingTime({ ratio, temp, height, elapsedHours, temperatureSeries = null, heightSeries = null }) {
    const Bprior = getRatioPriorBioHours(ratio);

    const tempNow = getCurrentTemperature(temp, temperatureSeries);
    const tempResponse = getTemperatureResponse(tempNow);

    const crossing = detectFirstDoubleCrossing(heightSeries);
    if (crossing) {
      const bioHoursElapsed = integrateTemperatureSeries(temperatureSeries);
      return makeObservedCrossingResult(crossing, bioHoursElapsed);
    }

    const elapsed = sanitizeElapsed(elapsedHours);

    const Belapsed = (Array.isArray(temperatureSeries) && temperatureSeries.length >= 2)
      ? integrateTemperatureSeries(temperatureSeries)
      : ((tempResponse.factor == null || elapsed == null) ? null : elapsed * tempResponse.factor);

    if (height === 'double' && elapsed != null) {
      return {
        totalHours: elapsed,
        remainingHours: 0,
        lowHours: Math.max(0, elapsed - 0.5),
        highHours: elapsed + 0.5,
        confidence: 'medium',
        status: 'crossed',
        basis: 'observed-double',
        bioHoursElapsed: Belapsed,
        tempFactorNow: tempResponse.factor,
        display: `约 ${roundDisplay(elapsed)} 小时`,
        trace: [{ id: 'timing:observed-double', note: `用户在 ${elapsed}h 观测到翻倍` }]
      };
    }

    if ((height === 'peak_plus' || height === 'over3') && elapsed != null) {
      return {
        totalHours: null,
        remainingHours: 0,
        lowHours: null,
        highHours: elapsed,
        confidence: 'medium',
        status: 'crossed-before-now',
        basis: 'observed-double',
        bioHoursElapsed: Belapsed,
        tempFactorNow: tempResponse.factor,
        display: `本轮已在 ${roundDisplay(elapsed)} 小时以内达到翻倍`,
        trace: [{ id: 'timing:crossed-before-now', note: `已超过 2x，首次 crossing ≤ ${elapsed}h` }]
      };
    }

    if (height === 'fallen' && !(Array.isArray(heightSeries) && heightSeries.length)) {
      return {
        totalHours: null,
        remainingHours: null,
        lowHours: null,
        highHours: null,
        confidence: 'low',
        status: 'trajectory-insufficient',
        basis: 'ratio-temp-prior',
        bioHoursElapsed: Belapsed,
        tempFactorNow: tempResponse.factor,
        display: '已回落；单次高度无法反推出本轮首次翻倍时刻',
        trace: [{ id: 'timing:trajectory-insufficient', note: '单点回落不足以反推 crossing' }]
      };
    }

    if (tempResponse.factor == null) {
      return {
        totalHours: null,
        remainingHours: null,
        lowHours: null,
        highHours: null,
        confidence: 'low',
        status: 'temperature-out-of-domain',
        basis: 'ratio-temp-prior',
        bioHoursElapsed: Belapsed,
        tempFactorNow: null,
        display: '当前温度超出有效域，不提供精确估时',
        trace: [{ id: 'timing:temperature-out-of-domain', note: tempResponse.reason }]
      };
    }

    if (elapsed == null || Belapsed == null) {
      const priorPhysical = Bprior / tempResponse.factor;
      return buildForecast({
        ratio,
        height,
        tempResponse,
        totalHours: priorPhysical,
        remainingHours: null,
        elapsed: null,
        basis: 'ratio-temp-prior',
        bioHoursElapsed: null,
        status: 'forecast'
      });
    }

    let Bhat = Bprior;
    let basis = 'ratio-temp-prior';

    if (height === 'none') {
      const pMax = Math.log2(1.20);
      const lowerBound = Belapsed / pMax;
      const priorPhysical = Bprior / tempResponse.factor;
      const weight = noRiseWeight({ elapsedHours: elapsed, priorPhysicalHours: priorPhysical });
      if (lowerBound > Bprior && weight > 0) {
        Bhat = geometricBlend(Bprior, clampObservedBioHours(lowerBound, Bprior), weight);
        basis = 'lower-bound-correction';
      }
    } else if (height === 'slight') {
      const p = Math.log2(1.35);
      const Bobs = Belapsed / p;
      Bhat = geometricBlend(Bprior, clampObservedBioHours(Bobs, Bprior), 0.35);
      basis = 'partial-height-correction';
    } else if (height === 'near') {
      const p = Math.log2(1.70);
      const Bobs = Belapsed / p;
      Bhat = geometricBlend(Bprior, clampObservedBioHours(Bobs, Bprior), 0.70);
      basis = 'partial-height-correction';
    }

    if (height !== 'double' && height !== 'peak_plus' && height !== 'over3') {
      Bhat = Math.max(Bhat, Belapsed * 1.03);
    }

    const Bremaining = Math.max(0, Bhat - Belapsed);
    const remaining = Bremaining / tempResponse.factor;
    const total = elapsed + remaining;

    return buildForecast({
      ratio,
      height,
      tempResponse,
      totalHours: total,
      remainingHours: remaining,
      elapsed,
      basis,
      bioHoursElapsed: Belapsed,
      status: 'forecast'
    });
  }

  function expectedRange(ratioValue, tempOrCoef, context = {}) {
    const timing = predictDoublingTime({
      ratio: ratioValue,
      temp: extractTemp(tempOrCoef),
      height: context.height ?? null,
      elapsedHours: context.elapsedHours ?? null,
      temperatureSeries: context.temperatureSeries ?? null,
      heightSeries: context.heightSeries ?? null
    });
    return {
      min: timing.lowHours,
      max: timing.highHours,
      reliable: timing.status !== 'temperature-out-of-domain' && timing.status !== 'trajectory-insufficient',
      reason: timing.basis
    };
  }

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
    result.citations = result.evidenceRefs
      .map(key => EVIDENCE_CATALOG[key] ? { key, ...EVIDENCE_CATALOG[key] } : { key, type:'unresolved' });
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

  return {
    STAGES, RATIOS, HEIGHTS, TEMPS, RATIO_BASE_HOURS, RATIO_PRIOR_BIO_HOURS_26C, EVIDENCE_CATALOG,
    normalizeStage, normalizeRatio, normalizeHeight, normalizeTemp,
    parseStarterInput, diagnoseStarter, formatAdvice, expectedRange, assessPh, isContaminated,
    rawPaperYeastRate, getTemperatureResponse, getRatioPriorBioHours,
    integrateTemperatureSeries, detectFirstDoubleCrossing, predictDoublingTime,
    geometricBlend, clampObservedBioHours, noRiseWeight, roundDisplay
  };
});
