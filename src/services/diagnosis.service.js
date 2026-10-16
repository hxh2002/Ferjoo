import { diagnoseStarter, formatAdvice, parseStarterInput, HEIGHTS, RATIOS, STAGES, getTemperatureResponse } from '../algorithms/index.js';

export { HEIGHTS, RATIOS, STAGES, diagnoseStarter, getTemperatureResponse };

export function diagnoseFromForm(form) {
  return diagnoseStarter(form);
}

export function diagnoseFromText(text, fallback = {}) {
  return diagnoseStarter({ ...fallback, ...parseStarterInput(text) });
}

export { formatAdvice, parseStarterInput };
