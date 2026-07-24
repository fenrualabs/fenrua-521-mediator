import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyFormulaContract } from '../src/formula.mjs';
import {
  computeReferenceEventCommitment,
  createReferenceEventContract,
  REFERENCE_EVENT_PROFILE_DIGEST,
  REFERENCE_EVENT_VECTOR_SET_DIGEST,
} from '../src/formula-reference.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vectorPath = path.join(root, 'formula', 'reference', 'f521-event-reference-v0.1-vectors.json');
const vectors = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
const resolver = () => createReferenceEventContract();

test('F521 event reference profile produces its fixed deterministic commitment', () => {
  const input = vectors.cases[0].input;
  assert.equal(computeReferenceEventCommitment(input), input.claimed_commitment);
  const result = verifyFormulaContract({ formula_id: vectors.formula_id, version: vectors.version, public_inputs: input }, { resolveContract: resolver });
  assert.deepEqual([result.disposition, result.reason_code, result.assurance_level], ['REFERENCE_VERIFIED', 'FML_REFERENCE_EVENT_MATCH', 'reference']);
  assert.equal(result.receipt.source_digest, REFERENCE_EVENT_PROFILE_DIGEST);
  assert.equal(result.receipt.vector_set_digest, REFERENCE_EVENT_VECTOR_SET_DIGEST);
});

test('F521 event reference profile rejects altered and noncanonical vectors', () => {
  for (const entry of vectors.cases.slice(1)) {
    const result = verifyFormulaContract({ formula_id: vectors.formula_id, version: vectors.version, public_inputs: entry.input }, { resolveContract: resolver });
    assert.equal(result.disposition, entry.expected_disposition, entry.case_id);
    assert.equal(result.assurance_level, 'reference', entry.case_id);
  }
});

test('F521 event reference contract is unable to claim a production lock', () => {
  const contract = createReferenceEventContract();
  assert.equal(contract.assurance_level, 'reference');
  assert.ok(contract.evidence.reference_profile_digest.startsWith('sha256:'));
  assert.equal('approval_digest' in contract.evidence, false);
  assert.match(contract.contract_digest, /^sha256:[a-f0-9]{64}$/);
});
