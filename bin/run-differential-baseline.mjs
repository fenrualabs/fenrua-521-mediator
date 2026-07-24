import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runDifferentialBaseline } from '../src/differential.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.argv[2] ?? path.join(root, 'evidence', 'differential', 'f521-differential-baseline-001-v0.1.json');
if (process.argv.length > 3) throw new TypeError('Usage: node bin/run-differential-baseline.mjs [outputPath]');

const report = runDifferentialBaseline({ outputPath });
process.stdout.write(`${JSON.stringify({ build_state: report.build_state, summary: report.summary, output_path: report.output_path, evidence_package_digest: report.evidence_package_digest })}\n`);
