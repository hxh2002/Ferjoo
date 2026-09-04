import { diagnoseStarter, formatAdvice, parseStarterInput } from '../algorithms/index.js';

export function diagnoseFromForm(form) {
  return diagnoseStarter(form);
}

export function diagnoseFromText(text, fallback = {}) {
  return diagnoseStarter({ ...fallback, ...parseStarterInput(text) });
}

export { formatAdvice, parseStarterInput };
