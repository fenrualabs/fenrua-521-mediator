#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runGreenBaseline } from '../src/baseline-runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let requestedOutput;
let createdAt;
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--created-at') {
    createdAt = process.argv[index + 1];
    index += 1;
  } else if (!requestedOutput) {
    requestedOutput = process.argv[index];
  } else {
    throw new TypeError('Usage: node bin/run-green-baseline.mjs [outputPath] [--created-at RFC3339]');
  }
}
const outputPath = requestedOutput
  ? path.resolve(requestedOutput)
  : path.join(root, 'evidence', 'baselines', 'fenrua-521-first-deterministic-baseline-v0.1.json');
const result = runGreenBaseline({ outputPath, ...(createdAt ? { createdAt } : {}) });
process.stdout.write(`${JSON.stringify({
  output_path: result.output_path,
  build_state: result.build_state,
  summary: result.summary,
  evidence_package_digest: result.evidence_package_digest,
}, null, 2)}\n`);
