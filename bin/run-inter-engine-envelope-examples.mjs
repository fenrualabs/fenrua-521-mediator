import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runInterEngineEnvelopeExamples } from '../src/inter-engine-envelope-runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.argv[2] ?? path.join(root, 'evidence', 'envelopes', 'fenrua-521-inter-engine-envelope-examples-v0.3.json');
if (process.argv.length > 3) throw new TypeError('Usage: node bin/run-inter-engine-envelope-examples.mjs [outputPath]');
const report = runInterEngineEnvelopeExamples({ outputPath });
process.stdout.write(`${JSON.stringify({ output_path: report.output_path, build_state: report.build_state, summary: report.summary, evidence_package_digest: report.evidence_package_digest })}\n`);
