import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFormulaTestProfile } from '../src/formula-test-profile-runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.argv[2] ?? path.join(root, 'evidence', 'formula', 'f521-fml-001-test-profile-v0.3.json');
if (process.argv.length > 3) throw new TypeError('Usage: node bin/run-formula-test-profile.mjs [outputPath]');
const report = runFormulaTestProfile({ outputPath });
process.stdout.write(`${JSON.stringify({ output_path: report.output_path, build_state: report.build_state, summary: report.summary, evidence_package_digest: report.evidence_package_digest })}\n`);
