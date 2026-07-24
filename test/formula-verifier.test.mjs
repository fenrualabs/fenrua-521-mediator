import assert from 'node:assert/strict';
import test from 'node:test';

import { CORE_FORMULA_CONTRACT_IDS, verifyFormulaContract } from '../src/formula.mjs';

const request = {
  formula_id: 'F521-EVENT-001',
  version: 'candidate-v1',
  public_inputs: { bounded_test_vector: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
};

function contract(verdict) {
  return {
    formula_contract_version: 'fenrua-521-formula-contract/v1',
    formula_id: request.formula_id,
    version: request.version,
    source_id: 'local-approved-contract',
    source_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    contract_digest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    disclosure_class: 'amber',
    local_verifier: () => verdict,
  };
}

test('KRN-FML-001 exposes only the core Formula Contract registry and fails closed when no contract is bound', () => {
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

test('KRN-FML-001 accepts a typed verdict only from a matching local Amber Formula Contract', () => {
  const verified = verifyFormulaContract(request, { resolveContract: () => contract({ valid: true, reason_code: 'FML_LOCAL_VERIFIED', public_result: true }) });
  assert.deepEqual([verified.disposition, verified.reason_code, verified.public_result], ['VERIFIED', 'FML_LOCAL_VERIFIED', true]);
  assert.equal(verified.receipt.source_digest, 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(verified.receipt.contract_digest, 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');

  const rejected = verifyFormulaContract(request, { resolveContract: () => contract({ valid: false, reason_code: 'FML_SIGNATURE_INVALID' }) });
  assert.deepEqual([rejected.disposition, rejected.reason_code], ['REJECTED', 'FML_SIGNATURE_INVALID']);
});

test('KRN-FML-001 rejects malformed inputs and preserves unknown or mismatched profiles as insufficient evidence', () => {
  const unknown = verifyFormulaContract({ formula_id: 'F521-NOT-REAL', version: 'candidate-v1', public_inputs: {} });
  assert.deepEqual([unknown.disposition, unknown.reason_code], ['INSUFFICIENT_EVIDENCE', 'FML_UNKNOWN_FORMULA']);
  const malformed = verifyFormulaContract({ formula_id: 'F521-EVENT-001', version: 'candidate-v1', public_inputs: [] });
  assert.deepEqual([malformed.disposition, malformed.reason_code], ['REJECTED', 'FML_MALFORMED_PUBLIC_INPUTS']);
  const mismatch = verifyFormulaContract(request, { resolveContract: () => ({ ...contract({ valid: true, reason_code: 'FML_LOCAL_VERIFIED' }), version: 'other-version' }) });
  assert.deepEqual([mismatch.disposition, mismatch.reason_code], ['INSUFFICIENT_EVIDENCE', 'FML_CONTRACT_MISMATCH']);
});
