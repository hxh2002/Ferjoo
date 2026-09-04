import {
  STAGES,
  RATIOS,
  HEIGHTS,
  TEMPS,
  diagnoseStarter,
  parseStarterInput
} from '../algorithms/index.js';

export const diagnosisService = Object.freeze({
  getOptions() {
    return {
      stages: STAGES.map(({ value, label }) => ({ value, label })),
      ratios: RATIOS.map(({ value, label }) => ({ value, label })),
      heights: HEIGHTS.map(({ value, label }) => ({ value, label })),
      temperatures: TEMPS.map(({ value, label, note }) => ({ value, label, note }))
    };
  },

  parseNaturalLanguage(text) {
    return parseStarterInput(text);
  },

  diagnose(input) {
    return diagnoseStarter(input);
  }
});
