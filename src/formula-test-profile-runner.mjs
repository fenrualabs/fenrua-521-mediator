import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalRecord, sha256Binding } from './common.mjs';
import { createFormulaTestProfileSession, TEST_PROFILE_DIGEST, TEST_PROFILE_ID, TEST_PROFILE_VECTOR_SET_DIGEST, TEST_PROFILE_VERSION, verifyFormulaTestProfile } from './formula-test-profile.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vectorPath = path.join(root, 'formula', 'test-profile', 'f521-fml-001-test-profile-v0.3-vectors.json');

/** Executes the 10 bounded synthetic vectors and records digest-only outcomes. */
export function runFormulaTestProfile({ outputPath, createdAt = new Date().toISOString(), vectorFile = vectorPath } = {}) {
  if (typeof outputPath !== 'string' || outputPath.length === 0) throw new TypeError('An evidence outputPath is required.');
  if (Number.isNaN(Date.parse(createdAt))) throw new TypeError('createdAt must be a valid timestamp.');
  const vectors = JSON.parse(fs.readFileSync(vectorFile, 'utf8'));
  if (vectors.profile_id !== TEST_PROFILE_ID || vectors.version !== TEST_PROFILE_VERSION || !Array.isArray(vectors.cases) || vectors.cases.length !== 10) throw new TypeError('The FML test profile vector set is not the bound 10-case profile.');
  const session = createFormulaTestProfileSession();
  const outcomes = vectors.cases.map((entry) => {
    const result = verifyFormulaTestProfile({ formula_id: entry.formula_id, version: vectors.version, public_inputs: entry.public_inputs }, { session });
    return { vector_id: entry.vector_id, formula_id: entry.formula_id, expected_disposition: entry.expected_disposition, actual_disposition: result.disposition, reason_code: result.reason_code, receipt_digest: result.receipt_digest, passed: result.disposition === entry.expected_disposition, receipt: result.receipt };
  });
  const summary = outcomes.reduce((counts, outcome) => {
    counts.total += 1;
    if (outcome.actual_disposition === 'REFERENCE_VERIFIED') counts.reference_verified += 1;
    if (outcome.actual_disposition === 'REJECTED') counts.rejected += 1;
    if (!outcome.passed) counts.error += 1;
    return counts;
  }, { total: 0, reference_verified: 0, rejected: 0, error: 0 });
  const report = {
    evidence_version: 'fenrua-521-formula-test-profile-evidence/v0.3', classification: 'amber_local_only',
    build_state: summary.error === 0 ? 'REFERENCE_EVIDENCE_RECORDED' : 'REFERENCE_EVIDENCE_FAILED', production_lock: 'NOT_REQUESTED', created_at: createdAt,
    test_profile: { profile_id: TEST_PROFILE_ID, version: TEST_PROFILE_VERSION, profile_digest: TEST_PROFILE_DIGEST, vector_set_digest: TEST_PROFILE_VECTOR_SET_DIGEST },
    summary, outcomes,
    limitations: ['This is an Amber-local synthetic test profile, not a production Formula Contract.', 'REFERENCE_VERIFIED proves only the explicit local vector result; it cannot authorize a production formula claim.', 'Only receipt and public-input digests are recorded; vector public inputs are not repeated in this evidence package.'],
    evidence_package_digest: '',
  };
  report.evidence_package_digest = sha256Binding(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${canonicalRecord(report)}\n`, 'utf8');
  return Object.freeze({ ...report, output_path: outputPath });
}
