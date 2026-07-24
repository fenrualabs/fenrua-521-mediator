import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCapabilityBaseline, createLoopbackEngineClient } from '../src/capability-baseline.mjs';
import { attestFrozenCapabilityRuntime } from '../src/capability-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.argv[2] ?? path.join(root, 'evidence', 'capability', 'f521-capability-baseline-001-v0.1.json');
if (process.argv.length > 3) throw new TypeError('Usage: node bin/run-capability-baseline.mjs [outputPath]');

const runtimeAttestation = attestFrozenCapabilityRuntime();
const engineClient = createLoopbackEngineClient({ apiKey: process.env.FENRUA_COLIBRI_API_KEY, endpoint: runtimeAttestation.endpoint });
const report = await runCapabilityBaseline({ outputPath, engineClient, runtimeAttestation });
process.stdout.write(`${JSON.stringify({ build_state: report.build_state, results: report.results, output_path: report.output_path, evidence_package_digest: report.evidence_package_digest })}\n`);
