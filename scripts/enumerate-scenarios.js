#!/usr/bin/env node
'use strict';

/**
 * Dr. Ferjoo finite scenario enumerator.
 *
 * This is deliberately a black-box consumer of starter-doctor.js. It does not
 * duplicate or mutate diagnosis rules, so it can be used as a regression and
 * coverage harness while the rule engine evolves.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const doctor = require('../starter-doctor');

const REPORT_SCHEMA = 'dr-ferjoo/scenario-enumeration/v1';
const AXIS_ORDER = ['stage', 'ratio', 'height', 'temp'];
const AXIS_SOURCES = {
  stage: doctor.STAGES,
  ratio: doctor.RATIOS,
  height: doctor.HEIGHTS,
  temp: doctor.TEMPS
};
const REQUIRED_STRING_FIELDS = [
  'stage',
  'stageLabel',
  'ratio',
  'ratioLabel',
  'height',
  'heightLabel',
  'temp',
  'tempLabel',
  'expectedHours',
  'state',
  'level'
];
const REQUIRED_ARRAY_FIELDS = ['reasons', 'actions', 'safety'];
const VALID_LEVELS = new Set(['ok', 'warn', 'danger', 'info']);

function canonicalAxisValues() {
  return Object.fromEntries(
    AXIS_ORDER.map((name) => [name, AXIS_SOURCES[name].map((item) => item.value)])
  );
}

function normalizeAxes(overrides = {}) {
  const canonical = canonicalAxisValues();
  const axes = {};

  for (const name of AXIS_ORDER) {
    const supplied = overrides[name];
    const values = supplied == null ? canonical[name] : supplied;
    if (!Array.isArray(values) || values.length === 0) {
      throw new TypeError(`Axis "${name}" must be a non-empty array`);
    }

    const deduplicated = [...new Set(values.map((value) => String(value).trim()))];
    const invalid = deduplicated.filter((value) => !canonical[name].includes(value));
    if (invalid.length) {
      throw new RangeError(
        `Unknown ${name} value(s): ${invalid.join(', ')}. ` +
          `Allowed: ${canonical[name].join(', ')}`
      );
    }
    axes[name] = deduplicated;
  }

  return axes;
}

function combinationCount(axes) {
  return AXIS_ORDER.reduce((total, name) => total * axes[name].length, 1);
}

function* scenarioInputs(axesInput = {}) {
  const axes = normalizeAxes(axesInput);
  for (const stage of axes.stage) {
    for (const ratio of axes.ratio) {
      for (const height of axes.height) {
        for (const temp of axes.temp) {
          yield { stage, ratio, height, temp };
        }
      }
    }
  }
}

function issue(code, message, field) {
  return field ? { code, field, message } : { code, message };
}

/**
 * Validate a diagnosis as an API contract, without asserting scientific truth.
 * Scientific and narrative review can be layered on top of this structural pass.
 */
function validateDiagnosis(input, result) {
  const issues = [];
  if (result == null) {
    return [issue('MISSING_RESULT', 'diagnoseStarter returned no result')];
  }
  if (typeof result !== 'object' || Array.isArray(result)) {
    return [issue('INVALID_RESULT_TYPE', 'Diagnosis must be a plain object')];
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(result, field)) {
      issues.push(issue('MISSING_FIELD', `Required field "${field}" is missing`, field));
    } else if (typeof result[field] !== 'string' || result[field].trim() === '') {
      issues.push(issue('EMPTY_OR_INVALID_FIELD', `Field "${field}" must be a non-empty string`, field));
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(result, field)) {
      issues.push(issue('MISSING_FIELD', `Required field "${field}" is missing`, field));
    } else if (!Array.isArray(result[field])) {
      issues.push(issue('INVALID_ARRAY_FIELD', `Field "${field}" must be an array`, field));
    } else {
      const invalidItems = result[field].filter(
        (item) => typeof item !== 'string' || item.trim() === ''
      );
      if (invalidItems.length) {
        issues.push(issue('INVALID_ARRAY_ITEM', `Field "${field}" contains empty/non-string items`, field));
      }
    }
  }

  if (Array.isArray(result.reasons) && result.reasons.length === 0) {
    issues.push(issue('EMPTY_REASONS', 'Diagnosis has no stated reason', 'reasons'));
  }
  if (Array.isArray(result.actions) && result.actions.length === 0) {
    issues.push(issue('EMPTY_ACTIONS', 'Diagnosis has no recommended action', 'actions'));
  }
  if (typeof result.level === 'string' && !VALID_LEVELS.has(result.level)) {
    issues.push(issue('INVALID_LEVEL', `Unknown diagnosis level "${result.level}"`, 'level'));
  }

  for (const field of AXIS_ORDER) {
    if (result[field] !== input[field]) {
      issues.push(
        issue(
          'AXIS_ECHO_MISMATCH',
          `Input ${field}=${input[field]} but diagnosis reports ${String(result[field])}`,
          field
        )
      );
    }
  }

  // Newer engines expose a traceable evidence contract. Keep backward
  // compatibility with the original API, but validate the whole contract as
  // soon as any one of its fields is present.
  const evidenceFields = ['ruleTrace', 'evidenceRefs', 'citations'];
  if (evidenceFields.some((field) => Object.prototype.hasOwnProperty.call(result, field))) {
    for (const field of evidenceFields) {
      if (!Array.isArray(result[field])) {
        issues.push(
          issue('INVALID_EVIDENCE_FIELD', `Evidence field "${field}" must be an array`, field)
        );
      }
    }
    if (Array.isArray(result.ruleTrace) && result.ruleTrace.length === 0) {
      issues.push(issue('EMPTY_RULE_TRACE', 'Diagnosis has no rule trace', 'ruleTrace'));
    }
    if (Array.isArray(result.evidenceRefs) && result.evidenceRefs.length === 0) {
      issues.push(issue('EMPTY_EVIDENCE_REFS', 'Diagnosis has no evidence references', 'evidenceRefs'));
    }
    if (Array.isArray(result.ruleTrace)) {
      const invalidTrace = result.ruleTrace.some(
        (entry) =>
          !entry || typeof entry !== 'object' ||
          typeof entry.ruleId !== 'string' || entry.ruleId.trim() === ''
      );
      if (invalidTrace) {
        issues.push(issue('INVALID_RULE_TRACE', 'Rule trace contains an invalid ruleId', 'ruleTrace'));
      }
    }
    if (Array.isArray(result.evidenceRefs) && Array.isArray(result.citations)) {
      const citationKeys = new Set(
        result.citations
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => entry.key)
      );
      const unresolved = result.evidenceRefs.filter(
        (ref) => typeof ref !== 'string' || ref.trim() === '' || !citationKeys.has(ref)
      );
      if (unresolved.length) {
        issues.push(
          issue(
            'UNRESOLVED_EVIDENCE_REF',
            `Evidence reference(s) lack citation records: ${unresolved.join(', ')}`,
            'citations'
          )
        );
      }
    }
  }

  return issues;
}

function narrativePayload(result) {
  return {
    state: result.state,
    level: result.level,
    reasons: result.reasons,
    actions: result.actions,
    safety: result.safety
  };
}

function narrativeFingerprint(result) {
  const serialized = JSON.stringify(narrativePayload(result));
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function increment(counter, key) {
  counter[key] = (counter[key] || 0) + 1;
}

function classifyIssueScenarios(anomalies) {
  const missingCodes = new Set([
    'MISSING_RESULT',
    'MISSING_FIELD',
    'EMPTY_OR_INVALID_FIELD',
    'EMPTY_REASONS',
    'EMPTY_ACTIONS',
    'EMPTY_FORMATTED_ADVICE'
  ]);
  let missing = 0;
  let thrown = 0;
  let invalid = 0;
  for (const anomaly of anomalies) {
    if (anomaly.issues.some((entry) => missingCodes.has(entry.code))) missing += 1;
    if (anomaly.issues.some((entry) => entry.code === 'ENGINE_ERROR')) thrown += 1;
    if (anomaly.issues.some((entry) => entry.code !== 'ENGINE_ERROR')) invalid += 1;
  }
  return { missing, thrown, invalid };
}

function makeEquivalenceClass(fingerprint, scenario, result) {
  return {
    id: `narrative-${fingerprint.slice(0, 12)}`,
    fingerprint,
    scenarioCount: 0,
    representativeScenarioId: scenario.id,
    representativeInput: scenario.input,
    narrative: narrativePayload(result),
    coveredValues: Object.fromEntries(AXIS_ORDER.map((name) => [name, []])),
    evidenceRefs: [],
    ruleIds: [],
    scenarioIds: []
  };
}

function addClassMember(group, scenario, result) {
  group.scenarioCount += 1;
  group.scenarioIds.push(scenario.id);
  for (const name of AXIS_ORDER) {
    if (!group.coveredValues[name].includes(scenario.input[name])) {
      group.coveredValues[name].push(scenario.input[name]);
    }
  }
  for (const ref of Array.isArray(result.evidenceRefs) ? result.evidenceRefs : []) {
    if (!group.evidenceRefs.includes(ref)) group.evidenceRefs.push(ref);
  }
  for (const trace of Array.isArray(result.ruleTrace) ? result.ruleTrace : []) {
    if (trace && trace.ruleId && !group.ruleIds.includes(trace.ruleId)) {
      group.ruleIds.push(trace.ruleId);
    }
  }
}

function generateReport(options = {}) {
  const axes = normalizeAxes(options.axes || {});
  const diagnose = options.diagnose || doctor.diagnoseStarter;
  const formatAdvice = options.formatAdvice || doctor.formatAdvice;
  const includeFormattedAdvice = options.includeFormattedAdvice === true;
  const scenarios = [];
  const anomalies = [];
  const classesByFingerprint = new Map();
  const levels = {};
  const states = {};
  let sequence = 0;

  for (const input of scenarioInputs(axes)) {
    sequence += 1;
    const scenario = {
      id: `scenario-${String(sequence).padStart(4, '0')}`,
      input,
      result: null,
      narrativeClassId: null,
      issues: []
    };

    try {
      scenario.result = diagnose(input);
      scenario.issues.push(...validateDiagnosis(input, scenario.result));

      if (scenario.result && typeof scenario.result === 'object') {
        try {
          const formatted = formatAdvice(scenario.result);
          if (typeof formatted !== 'string' || formatted.trim() === '') {
            scenario.issues.push(
              issue('EMPTY_FORMATTED_ADVICE', 'formatAdvice returned no readable report')
            );
          } else if (includeFormattedAdvice) {
            scenario.formattedAdvice = formatted;
          }
        } catch (error) {
          scenario.issues.push(issue('FORMATTER_ERROR', error.message || String(error)));
        }
      }
    } catch (error) {
      scenario.issues.push(issue('ENGINE_ERROR', error.message || String(error)));
    }

    if (scenario.issues.length === 0) {
      const fingerprint = narrativeFingerprint(scenario.result);
      let group = classesByFingerprint.get(fingerprint);
      if (!group) {
        group = makeEquivalenceClass(fingerprint, scenario, scenario.result);
        classesByFingerprint.set(fingerprint, group);
      }
      addClassMember(group, scenario, scenario.result);
      scenario.narrativeClassId = group.id;
      increment(levels, scenario.result.level);
      increment(states, scenario.result.state);
    } else {
      anomalies.push({
        scenarioId: scenario.id,
        input: scenario.input,
        issues: scenario.issues
      });
    }

    scenarios.push(scenario);
  }

  const equivalenceClasses = [...classesByFingerprint.values()];
  const classified = classifyIssueScenarios(anomalies);
  const rawCombinationCount = combinationCount(axes);
  const validScenarioCount = rawCombinationCount - anomalies.length;
  const classMemberCount = equivalenceClasses.reduce(
    (total, group) => total + group.scenarioCount,
    0
  );

  return {
    schema: REPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    engine: 'starter-doctor.js',
    equivalenceDefinition:
      'Exact equality of state, level, reasons, actions, and safety; echoed input labels and expectedHours metadata are excluded.',
    axes,
    summary: {
      axisCounts: Object.fromEntries(AXIS_ORDER.map((name) => [name, axes[name].length])),
      rawCombinationCount,
      processedScenarioCount: scenarios.length,
      validScenarioCount,
      anomalyScenarioCount: anomalies.length,
      invalidOutputScenarioCount: classified.invalid,
      missingOutputScenarioCount: classified.missing,
      thrownErrorScenarioCount: classified.thrown,
      narrativeEquivalenceClassCount: equivalenceClasses.length,
      classMemberCount,
      compressionFactor:
        equivalenceClasses.length === 0
          ? null
          : Number((validScenarioCount / equivalenceClasses.length).toFixed(2)),
      levels,
      states
    },
    anomalies,
    equivalenceClasses,
    scenarios
  };
}

function reportToNdjson(report) {
  const lines = [];
  lines.push(
    JSON.stringify({
      type: 'metadata',
      schema: report.schema,
      generatedAt: report.generatedAt,
      engine: report.engine,
      equivalenceDefinition: report.equivalenceDefinition,
      axes: report.axes
    })
  );
  for (const scenario of report.scenarios) {
    lines.push(JSON.stringify({ type: 'scenario', ...scenario }));
  }
  for (const group of report.equivalenceClasses) {
    lines.push(JSON.stringify({ type: 'equivalenceClass', ...group }));
  }
  for (const anomaly of report.anomalies) {
    lines.push(JSON.stringify({ type: 'anomaly', ...anomaly }));
  }
  lines.push(JSON.stringify({ type: 'summary', ...report.summary }));
  return `${lines.join('\n')}\n`;
}

function serializeReport(report, format, pretty) {
  if (format === 'ndjson') return reportToNdjson(report);
  if (format === 'json') return `${JSON.stringify(report, null, pretty ? 2 : 0)}\n`;
  throw new RangeError(`Unsupported format "${format}"; use json or ndjson`);
}

function writeReport(report, options = {}) {
  const content = serializeReport(report, options.format || 'json', options.pretty === true);
  const output = options.output || '-';
  if (output === '-') {
    process.stdout.write(content);
  } else {
    const resolved = path.resolve(output);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf8');
  }
  return content.length;
}

function parseList(raw) {
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function takeValue(argv, index, name) {
  if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return argv[index + 1];
}

function parseArgs(argv) {
  const options = {
    format: 'json',
    output: '-',
    pretty: false,
    selfCheck: false,
    includeFormattedAdvice: false,
    help: false,
    axes: {}
  };
  const axisFlags = {
    '--stages': 'stage',
    '--ratios': 'ratio',
    '--heights': 'height',
    '--temps': 'temp'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (axisFlags[arg]) {
      options.axes[axisFlags[arg]] = parseList(takeValue(argv, i, arg));
      i += 1;
    } else if (arg === '--format') {
      options.format = takeValue(argv, i, arg);
      i += 1;
    } else if (arg === '--output' || arg === '-o') {
      options.output = takeValue(argv, i, arg);
      i += 1;
    } else if (arg === '--pretty') {
      options.pretty = true;
    } else if (arg === '--include-advice') {
      options.includeFormattedAdvice = true;
    } else if (arg === '--self-check') {
      options.selfCheck = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function helpText() {
  return `Dr. Ferjoo finite scenario enumerator

Usage:
  node scripts/enumerate-scenarios.js [options]

Options:
  --format json|ndjson       Report format (default: json)
  -o, --output FILE          Write report to FILE (default: stdout)
  --pretty                   Pretty-print JSON
  --include-advice           Include formatAdvice Markdown per scenario
  --stages LIST              Comma-separated canonical stage values
  --ratios LIST              Comma-separated canonical ratio values
  --heights LIST             Comma-separated canonical height values
  --temps LIST               Comma-separated canonical temperature values
  --self-check               Run structural invariants; do not emit a report
  -h, --help                 Show this help

Examples:
  node scripts/enumerate-scenarios.js --self-check
  node scripts/enumerate-scenarios.js --pretty -o reports/scenarios.json
  node scripts/enumerate-scenarios.js --format ndjson -o reports/scenarios.ndjson
  node scripts/enumerate-scenarios.js --stages mature --temps t_25_28 --pretty
`;
}

function selfCheck(report) {
  const failures = [];
  const expectedCount = combinationCount(report.axes);
  if (report.summary.processedScenarioCount !== expectedCount) {
    failures.push(
      `Processed ${report.summary.processedScenarioCount}, expected ${expectedCount} combinations`
    );
  }
  if (report.summary.anomalyScenarioCount !== 0) {
    failures.push(`${report.summary.anomalyScenarioCount} scenario(s) have structural anomalies`);
  }
  if (report.summary.classMemberCount !== report.summary.validScenarioCount) {
    failures.push(
      `Equivalence classes contain ${report.summary.classMemberCount}, ` +
        `expected ${report.summary.validScenarioCount} valid scenarios`
    );
  }
  if (
    report.summary.validScenarioCount > 0 &&
    report.summary.narrativeEquivalenceClassCount === 0
  ) {
    failures.push('No narrative equivalence classes were generated');
  }
  return failures;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(helpText());
    return 0;
  }

  const report = generateReport({
    axes: options.axes,
    includeFormattedAdvice: options.includeFormattedAdvice
  });

  if (options.selfCheck) {
    const failures = selfCheck(report);
    const { summary } = report;
    process.stdout.write(
      `Scenarios: ${summary.processedScenarioCount}; ` +
        `narrative classes: ${summary.narrativeEquivalenceClassCount}; ` +
        `anomalies: ${summary.anomalyScenarioCount}\n`
    );
    if (failures.length) {
      failures.forEach((failure) => process.stderr.write(`FAIL: ${failure}\n`));
      return 1;
    }
    process.stdout.write('Self-check passed.\n');
    return 0;
  }

  writeReport(report, options);
  return report.summary.anomalyScenarioCount === 0 ? 0 : 2;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`Error: ${error.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  REPORT_SCHEMA,
  AXIS_ORDER,
  canonicalAxisValues,
  normalizeAxes,
  combinationCount,
  scenarioInputs,
  validateDiagnosis,
  narrativePayload,
  narrativeFingerprint,
  generateReport,
  reportToNdjson,
  serializeReport,
  writeReport,
  parseArgs,
  selfCheck,
  main
};
