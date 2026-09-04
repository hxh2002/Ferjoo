// Runtime-sized citation metadata. The complete library is kept in this references folder.

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

export function getEvidence(key) {
  return EVIDENCE_CATALOG[key] ? { key, ...EVIDENCE_CATALOG[key] } : { key, type: 'unresolved' };
}

export function resolveEvidenceRefs(keys = []) {
  return keys.map(getEvidence);
}

export { EVIDENCE_CATALOG };
