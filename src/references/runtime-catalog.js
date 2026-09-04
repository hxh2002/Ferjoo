const EVIDENCE_CATALOG = {
  'CSU-STARTER-2025': {
    type: 'official-extension-guidance', public: true, kind: '官方指南',
    authorsShort: 'CSU Extension', source: 'FoodSmart Colorado', year: '2025',
    title: 'Sourdough Starter Best Practices',
    citation: 'Colorado State University Extension. Sourdough Starter Best Practices. Reviewed October 2025.',
    url: 'https://extension.colostate.edu/resource/sourdough-starter-best-practices/',
    supports: 'pH 4.6 as an acidification reference; discard colored/fuzzy mold; an alcoholic liquid layer alone can be a fermentation by-product.',
    displayNote: '用于判断霉变、酒精液层，以及家庭酵种的基础安全边界。'
  },
  'FDA-RAW-FLOUR-2023': {
    type: 'regulatory-guidance', public: true, kind: '官方指南',
    authorsShort: 'U.S. FDA', source: 'Food Safety', year: '2023',
    title: 'Flour Is a Raw Food and Other Safety Facts',
    citation: 'U.S. Food and Drug Administration. Flour Is a Raw Food and Other Safety Facts. 2023.',
    url: 'https://www.fda.gov/consumers/consumer-updates/flour-raw-food-and-other-safety-facts',
    supports: 'Raw flour, dough, and starter should not be tasted; baking/cooking is the microbial kill step.',
    displayNote: '说明面粉属于生食材，生酵种不应直接品尝，充分烘烤才是最终加热步骤。'
  },
  'BRANDT-2004': {
    type: 'primary-research', public: true, kind: '原始研究',
    authorsShort: 'Brandt et al.', source: 'European Food Research and Technology', year: '2004',
    title: 'Effects of process parameters on growth and metabolism of Lactobacillus sanfranciscensis and Candida humilis during rye sourdough fermentation',
    citation: 'Brandt MJ, Hammes WP, Gänzle MG. Eur Food Res Technol. 2004;218:333–338.',
    url: 'https://doi.org/10.1007/s00217-003-0867-0',
    supports: 'Temperature effects differ by organism and high temperature can inhibit sourdough yeasts.',
    displayNote: '高温并不是简单的“越热越快”。'
  },
  'VRANCKEN-2011': {
    type: 'primary-research', public: true, kind: '原始研究',
    authorsShort: 'Vrancken et al.', source: 'Applied and Environmental Microbiology', year: '2011',
    title: 'Influence of Temperature and Backslopping Time on the Microbiota of a Type I Propagated Laboratory Wheat Sourdough Fermentation',
    citation: 'Vrancken G et al. Appl Environ Microbiol. 2011;77(8):2716–2726.',
    url: 'https://doi.org/10.1128/AEM.02470-10',
    supports: 'Temperature and backslopping time changed the dominant microbial community.',
    displayNote: '温度和回接间隔会改变优势微生物组成。'
  },
  'CALVERT-2021': {
    type: 'peer-reviewed-review', public: true, kind: '综述',
    authorsShort: 'Calvert et al.', source: 'PeerJ', year: '2021',
    title: 'A review of sourdough starters: ecology, practices, and sensory quality',
    citation: 'Calvert MD et al. PeerJ. 2021;9:e11389.',
    url: 'https://doi.org/10.7717/peerj.11389',
    supports: 'Temperature, hydration, ingredients, and refeeding practices can change microbial ecology and activity.',
    displayNote: '温度、含水量、原料与维护方式会共同影响酵种表现。'
  },
  'MCKENNEY-2023': {
    type: 'primary-research', public: true, kind: '原始研究',
    authorsShort: 'McKenney et al.', source: 'PeerJ', year: '2023',
    title: 'Sourdough starters exhibit similar succession patterns but develop flour-specific climax communities',
    citation: 'McKenney EA et al. PeerJ. 2023;11:e16163.',
    url: 'https://doi.org/10.7717/peerj.16163',
    supports: 'New starters show succession over time and flour-specific differences remain.',
    displayNote: '支持新起种的阶段性变化与不同面粉间差异。'
  },
  'LANDIS-2021': {
    type: 'primary-research', public: true, kind: '原始研究',
    authorsShort: 'Landis et al.', source: 'eLife', year: '2021',
    title: 'The diversity and function of sourdough starter microbiomes',
    citation: 'Landis EA et al. eLife. 2021;10:e61644.',
    url: 'https://doi.org/10.7554/eLife.61644',
    supports: 'Household starters vary substantially in microbiome, rise rate, and aroma.',
    displayNote: '家庭酵种差异很大，因此趋势观察比单次阈值更可靠。'
  },
  'DE-VUYST-2009': {
    type: 'peer-reviewed-review', public: true, kind: '综述',
    authorsShort: 'De Vuyst et al.', source: 'Food Microbiology', year: '2009',
    title: 'Biodiversity, ecological determinants, and metabolic exploitation of sourdough microbiota',
    citation: 'De Vuyst L et al. Food Microbiol. 2009;26(7):666–675.',
    url: 'https://doi.org/10.1016/j.fm.2009.07.012',
    supports: 'Sourdough ecology depends on flour, process conditions, pH, temperature, hydration and refreshments.',
    displayNote: '发酵生态由多项过程参数共同塑造。'
  },
  'MINERVINI-2014': {
    type: 'peer-reviewed-review', public: true, kind: '综述',
    authorsShort: 'Minervini et al.', source: 'International Journal of Food Microbiology', year: '2014',
    title: 'Ecological parameters influencing microbial diversity and stability of traditional sourdough',
    citation: 'Minervini F et al. Int J Food Microbiol. 2014;171:136–146.',
    url: 'https://doi.org/10.1016/j.ijfoodmicro.2013.11.021',
    supports: 'Fermentation time, temperature, inoculum and flour composition affect sourdough stability.',
    displayNote: '时间、温度、接种量与面粉需要一起理解。'
  },
  'GANZLE-2014': {
    type: 'peer-reviewed-review', public: true, kind: '综述',
    authorsShort: 'Gänzle', source: 'Food Microbiology', year: '2014',
    title: 'Enzymatic and bacterial conversions during sourdough fermentation',
    citation: 'Gänzle MG. Food Microbiol. 2014;37:2–10.',
    url: 'https://doi.org/10.1016/j.fm.2013.04.007',
    supports: 'Microbial metabolism, cereal enzymes, acidification and substrate availability interact.',
    displayNote: '发酵并非单一“酵母速度”问题。'
  },
  'GANZLE-1998': {
    type: 'primary-research', public: true, kind: '原始研究',
    authorsShort: 'Gänzle et al.', source: 'Applied and Environmental Microbiology', year: '1998',
    title: 'Modeling of Growth of Lactobacillus sanfranciscensis and Candida milleri in Response to Process Parameters of Sourdough Fermentation',
    citation: 'Gänzle MG, Ehmann M, Hammes WP. Appl Environ Microbiol. 1998;64(7):2616–2623.',
    url: null,
    supports: 'Temperature response is nonlinear; strain growth-rate data should not be presented as a universal jar doubling time.',
    displayNote: '论文温度响应只作为相对生物时钟，不直接等同罐中高度翻倍时间。'
  },
  'FERJOO-EXP-TIME-001': {
    type: 'brand-experience-needs-calibration', public: false,
    citation: 'Dr. Ferjoo internal rule prior: ratio-specific peak-time windows at 25–28°C.',
    url: null,
    supports: 'Displayed ratio × temperature time windows are empirical priors, not universal literature constants.'
  },
  'FERJOO-EXP-STAGE-001': {
    type: 'brand-experience-needs-calibration', public: false,
    citation: 'Dr. Ferjoo internal rule prior: stage and rise-state interpretation.',
    url: null,
    supports: 'Stage-specific narrative and action wording pending prospective curve calibration.'
  }
};

export function getEvidence(key) {
  return EVIDENCE_CATALOG[key] ? { key, ...EVIDENCE_CATALOG[key] } : { key, type: 'unresolved' };
}
export function resolveEvidenceRefs(keys = []) {
  return keys.map(getEvidence);
}
export { EVIDENCE_CATALOG };
