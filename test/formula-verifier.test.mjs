import assert from 'node:assert/strict';
import test from 'node:test';

import { CORE_FORMULA_CONTRACT_IDS, verifyFormulaContract } from '../src/formula.mjs';

const request = {
  formula_id: 'F521-EVENT-001',
  version: 'candidate-v1',
  public_inputs: { bounded_test_vector: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
};

const digest = (character) => `sha256:${character.repeat(64)}`;

function contract(assuranceLevel, verdict, evidence = {}) {
  return {
    formula_contract_version: 'fenrua-521-formula-contract/v1',
    formula_id: request.formula_id,
    version: request.version,
    source_id: 'local-approved-contract',
    source_digest: digest('b'),
    contract_digest: digest('c'),
    disclosure_class: 'amber',
    assurance_level: assuranceLevel,
    evidence: assuranceLevel === 'reference' ? {
      reference_profile_digest: digest('d'),
      vector_set_digest: digest('e'),
      ...evidence,
    } : {
      vector_set_digest: digest('e'),
      reference_evidence_digest: digest('f'),
      independent_verifier_digest: digest('1'),
      approval_digest: digest('2'),
      ...evidence,
    },
    local_verifier: () => verdict,
  };
}

test('KRN-FML-001 exposes the core registry and fails closed when no contract is bound', () => {
  assert.deepEqual(CORE_FORMULA_CONTRACT_IDS, [
    'F521-KEY-001', 'F521-ID-001', 'F521-EVENT-001', 'F521-P521-001', 'F521-NN-001',
    'F521-INGRESS-001', 'F521-LEDGER-001', 'F521-EPOCH-001', 'F521-INCLUSION-001',
  ]);
  const unbound = verifyFormulaContract(request);
  assert.deepEqual([unbound.disposition, unbound.reason_code], ['INSUFFICIENT_EVIDENCE', 'FML_CONTRACT_UNBOUND']);
  assert.match(unbound.receipt_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal('public_inputs' in unbound.receipt, false);
  assert.equal('source_id' in unbound.receipt, false);
});

test('KRN-FML-001 records reference success without granting production verification', () => {
  const reference = verifyFormulaContract(request, {
    resolveContract: () => contract('reference', { valid: true, reason_code: 'FML_REFERENCE_MATCH', public_result: true }),
  });
  assert.deepEqual([reference.disposition, reference.assurance_level, reference.public_result], ['REFERENCE_VERIFIED', 'reference', true]);
  assert.equal(reference.receipt.vector_set_digest, digest('e'));
});

test('KRN-FML-001 requires complete evidence before a production contract can verify', () => {
  const verified = verifyFormulaContract(request, {
    resolveContract: () => contract('production', { valid: true, reason_code: 'FML_PRODUCTION_MATCH', public_result: true }),
  });
  assert.deepEqual([verified.disposition, verified.assurance_level, verified.public_result], ['VERIFIED', 'production', true]);

  const incomplete = verifyFormulaContract(request, {
    resolveContract: () => contract('production', { valid: true, reason_code: 'FML_PRODUCTION_MATCH' }, { approval_digest: 'not-a-digest' }),
  });
  assert.deepEqual([incomplete.disposition, incomplete.reason_code], ['INSUFFICIENT_EVIDENCE', 'FML_CONTRACT_MISMATCH']);
});

test('KRN-FML-001 rejects malformed inputs and invalid local verdicts', () => {
  const unknown = verifyFormulaContract({ formula_id: 'F521-NOT-REAL', version: 'candidate-v1', public_inputs: {} });
  assert.deepEqual([unknown.disposition, unknown.reason_code], ['INSUFFICIENT_EVIDENCE', 'FML_UNKNOWN_FORMULA']);
  const malformed = verifyFormulaContract({ formula_id: 'F521-EVENT-001', version: 'candidate-v1', public_inputs: [] });
  assert.deepEqual([malformed.disposition, malformed.reason_code], ['REJECTED', 'FML_MALFORMED_PUBLIC_INPUTS']);
  const invalidVerdict = verifyFormulaContract(request, { resolveContract: () => contract('reference', { valid: 'yes', reason_code: 'FML_BAD' }) });
  assert.deepEqual([invalidVerdict.disposition, invalidVerdict.reason_code], ['REJECTED', 'FML_INVALID_LOCAL_VERDICT']);
});
