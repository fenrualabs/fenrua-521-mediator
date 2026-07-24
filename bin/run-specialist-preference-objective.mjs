import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPreferenceObjective } from '../src/preference-objective.mjs';

if (process.argv.length > 3) throw new TypeError('Usage: node bin/run-specialist-preference-objective.mjs [outputPath]');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'evidence', 'preference', 'f521-pref-001-preflight-v0.1.json');
const report = runPreferenceObjective({ outputPath });
console.log(JSON.stringify({ objective: report.objective, build_state: report.build_state, candidate_success: report.candidate_success, model_coverage: report.model_coverage, evidence_package_digest: report.evidence_package_digest, output_path: report.output_path }, null, 2));
