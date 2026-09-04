#!/usr/bin/env node
import fs from 'node:fs';
import { HEIGHTS, RATIOS, STAGES, TEMPS } from './dimensions.js';
import { diagnoseStarter } from './diagnosis.js';

export function enumerateScenarios() {
  const rows = [];
  for (const stage of STAGES) {
    for (const ratio of RATIOS) {
      for (const height of HEIGHTS) {
        for (const temp of TEMPS) {
          const result = diagnoseStarter({
            stage: stage.value, ratio: ratio.value, height: height.value, temp: temp.value
          });
          rows.push({
            stage: stage.value,
            ratio: ratio.value,
            height: height.value,
            temp: temp.value,
            status: result.status,
            tone: result.tone,
            title: result.title
          });
        }
      }
    }
  }
  return rows;
}

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = enumerateScenarios();
  if (args.includes('--self-check')) {
    if (rows.length !== 2016) {
      console.error(`Expected 2016 scenarios, got ${rows.length}`);
      process.exit(1);
    }
    const broken = rows.filter((x) => !x.status || !x.title);
    if (broken.length) {
      console.error(`Broken scenarios: ${broken.length}`);
      process.exit(1);
    }
    console.log(`Scenario audit OK: ${rows.length} combinations.`);
  } else {
    const outIndex = args.indexOf('-o');
    const output = outIndex >= 0 ? args[outIndex + 1] : null;
    const text = JSON.stringify(rows, null, args.includes('--pretty') ? 2 : 0);
    if (output) fs.writeFileSync(output, text);
    else console.log(text);
  }
}
