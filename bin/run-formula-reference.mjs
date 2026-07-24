import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256Binding } from '../src/common.mjs';
import { verifyFormulaContract } from '../src/formula.mjs';
import {
  createReferenceEventContract,
  REFERENCE_EVENT_PROFILE_DIGEST,
  REFERENCE_EVENT_VECTOR_SET_DIGEST,
} from '../src/formula-reference.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vectorPath = path.join(root, 'formula', 'reference', 'f521-event-reference-v0.1-vectors.json');
const evidencePath = path.join(root, 'evidence', 'formula', 'f521-event-reference-v0.1.json');
const vectors = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
const contract = createReferenceEventContract();
const outcomes = vectors.cases.map((entry) => {
  const result = verifyFormulaContract({
    formula_id: vectors.formula_id,
    version: vectors.version,
    public_inputs: entry.input,
  }, { resolveContract: () => contract });
  return {
    case_id: entry.case_id,
    expected_disposition: entry.expected_disposition,
    actual_disposition: result.disposition,
    reason_code: result.reason_code,
    receipt_digest: result.receipt_digest,
    passed: result.disposition === entry.expected_disposition,
  };
});
const summary = outcomes.reduce((counts, outcome) => {
  counts.total += 1;
  if (outcome.actual_disposition === 'REFERENCE_VERIFIED') counts.reference_verified += 1;
  if (outcome.actual_disposition === 'REJECTED') counts.rejected += 1;
  if (!outcome.passed) counts.error += 1;
  return counts;
}, { total: 0, reference_verified: 0, rejected: 0, error: 0 });
const evidence = {
  evidence_version: 'fenrua-521-formula-reference-evidence/v1',
  classification: 'amber_local_only',
  build_state: summary.error === 0 ? 'REFERENCE_EVIDENCE_RECORDED' : 'REFERENCE_EVIDENCE_FAILED',
  production_lock: 'NOT_REQUESTED',
  contract: {
    source_digest: REFERENCE_EVENT_PROFILE_DIGEST,
    vector_set_digest: REFERENCE_EVENT_VECTOR_SET_DIGEST,
    contract_digest: contract.contract_digest,
  },
  summary,
  outcomes,
};
const evidencePackage = { ...evidence, evidence_package_digest: sha256Binding(evidence) };
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
fs.writeFileSync(evidencePath, `${JSON.stringify(evidencePackage, null, 2)}\n`, 'utf8');
if (summary.error > 0) process.exitCode = 1;
process.stdout.write(`${JSON.stringify({ evidence_path: evidencePath, build_state: evidencePackage.build_state, summary, evidence_package_digest: evidencePackage.evidence_package_digest })}\n`);
