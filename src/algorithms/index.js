export {
  STAGES,
  RATIOS,
  HEIGHTS,
  TEMPS,
  RATIO_BASE_HOURS,
  RATIO_PRIOR_BIO_HOURS_26C
} from './dimensions.js';

export {
  normalizeStage,
  normalizeRatio,
  normalizeHeight,
  normalizeTemp,
  parseStarterInput,
  isContaminated,
  roundDisplay
} from './normalization.js';

export {
  rawPaperYeastRate,
  getTemperatureResponse,
  getRatioPriorBioHours,
  integrateTemperatureSeries,
  detectFirstDoubleCrossing,
  predictDoublingTime,
  expectedRange,
  geometricBlend,
  clampObservedBioHours,
  noRiseWeight
} from './doubling-predictor.js';

export { assessPh, diagnoseStarter, formatAdvice } from './diagnosis.js';

