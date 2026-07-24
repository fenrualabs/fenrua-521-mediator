import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPreferenceDataPackage } from '../src/preference-objective.mjs';

if (process.argv.length > 3) throw new TypeError('Usage: node bin/build-preference-data-package.mjs [outputPath]');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'preference', 'f521-pref-001-data-package-v0.1.json');
const report = buildPreferenceDataPackage({ outputPath });
console.log(JSON.stringify({ package_id: report.package_id, package_digest: report.package_digest, output_path: report.output_path }, null, 2));
