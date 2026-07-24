import assert from 'node:assert/strict';
import test from 'node:test';

import { intakeRequest, processEvidenceRequest, validateEvidenceDisposition, validateSemantics } from '../index.mjs';
import { validRecord, validRequest } from './fixtures.mjs';

test('processes a Green record through all five stages and emits a bounded receipt', () => {
  const result = processEvidenceRequest(validRequest(), { createdAt: '2026-07-25T01:02:03.000Z' });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'verified');
  assert.deepEqual(result.receipt.stages, ['KRN-INT-001', 'KRN-SCH-001', 'KRN-SEM-001', 'KRN-POL-001', 'KRN-REC-001']);
  assert.equal(result.receipt.created_at, '2026-07-25T01:02:03.000Z');
  assert.match(result.receipt.receipt_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal('record' in result, false);
});

test('KRN-SCH-001 rejects a structurally invalid record before semantic validation', () => {
  const record = validRecord();
  delete record.actor.identifier;
  const result = validateEvidenceDisposition(record, 'krn-test');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SCHEMA_VALIDATION_FAILED');
});

test('KRN-SCH-001 preserves schema-permitted empty inference annotations', () => {
  const record = validRecord({
    inferences: [{
      statement: 'A bounded conclusion follows from the synthetic fact.',
      depends_on: ['F-001'],
      assumptions: [''],
      confidence: 'bounded',
      counterexamples_considered: [''],
    }],
  });
  const result = validateEvidenceDisposition(record, 'krn-test');
  assert.equal(result.ok, true);
});

test('KRN-SEM-001 rejects duplicate fact IDs', () => {
  const record = validRecord({
    facts: [validRecord().facts[0], { ...validRecord().facts[0], statement: 'Another synthetic statement.' }],
  });
  const result = validateSemantics(record, 'krn-test');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DUPLICATE_FACT_ID');
});

test('KRN-SEM-001 applies the frozen SEM-009 source and evidence binding convention', () => {
  const record = validRecord({ facts: [{ ...validRecord().facts[0], evidence_ref: 'unbound-evidence' }] });
  const result = validateSemantics(record, 'krn-test');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SOURCE_CLASSIFICATION_MISMATCH');
});

test('KRN-SEM-001 fails closed for every remaining rule family', () => {
  const cases = [
    {
      name: 'dangling inference dependency',
      record: validRecord({
        inferences: [{ statement: 'A conclusion.', depends_on: ['F-MISSING'], assumptions: [], confidence: 'low', counterexamples_considered: [] }],
      }),
      code: 'DANGLING_INFERENCE_DEPENDENCY',
    },
    {
      name: 'inference promoted to fact',
      record: validRecord({
        inferences: [{ statement: 'A synthetic record exists.', depends_on: ['F-001'], assumptions: [], confidence: 'low', counterexamples_considered: [] }],
      }),
      code: 'INFERENCE_PROMOTED_TO_FACT',
    },
    { name: 'sufficient disposition without evidence', record: validRecord({ evidence_refs: [] }), code: 'SUFFICIENT_WITHOUT_COMPLETE_EVIDENCE' },
    {
      name: 'insufficient disposition without missing list',
      record: validRecord({ disposition: 'INSUFFICIENT_EVIDENCE', missing_evidence: [] }),
      code: 'INSUFFICIENT_WITHOUT_MISSING_LIST',
    },
    {
      name: 'conflict disposition without conflict list',
      record: validRecord({ disposition: 'CONFLICTING_EVIDENCE', conflicts: [] }),
      code: 'CONFLICTING_WITHOUT_CONFLICT_LIST',
    },
    {
      name: 'policy refusal without prohibited action',
      record: validRecord({ disposition: 'REFUSED_BY_POLICY', authority_status: 'refused', prohibited_actions: [] }),
      code: 'REFUSED_WITHOUT_PROHIBITED_ACTION',
    },
    {
      name: 'contained disposition with authority escalation',
      record: validRecord({ disposition: 'CONTAINED_OR_OUT_OF_SCOPE' }),
      code: 'AUTHORITY_STATUS_INCONSISTENT',
    },
    {
      name: 'record safety limit',
      record: validRecord({ risks: Array.from({ length: 17 }, (_, index) => `Synthetic risk ${index}.`) }),
      code: 'RECORD_SIZE_LIMIT_EXCEEDED',
    },
    {
      name: 'canary residue',
      record: validRecord({ claim_scope: 'f521-canary marker appears in this synthetic test.' }),
      code: 'RAW_OR_CANARY_CONTENT_DETECTED',
      contained: true,
    },
  ];

  for (const semanticCase of cases) {
    const result = validateSemantics(semanticCase.record, 'krn-test');
    assert.equal(result.ok, false, semanticCase.name);
    assert.equal(result.code, semanticCase.code, semanticCase.name);
    if (semanticCase.contained) assert.equal(result.status, 'contained', semanticCase.name);
  }
});

test('KRN-SEM-001 contains Red material without returning it', () => {
  const base = validRecord();
  const record = validRecord({
    facts: [{ ...base.facts[0], disclosure_class: 'red' }],
    evidence_refs: [{ ...base.evidence_refs[0], classification: 'red' }],
    integrity: { source_bindings: [{ ...base.integrity.source_bindings[0], classification: 'red' }] },
  });
  const result = validateSemantics(record, 'krn-test');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'contained');
  assert.equal(result.code, 'RED_DATA_IN_MODEL_PATH');
});

test('KRN-INT-001 contains undeclared classifications before model delivery', () => {
  const result = intakeRequest({ classification: 'red', fixture_id: 'f521-syn-case-000001', record: validRecord() });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'contained');
  assert.equal(result.code, 'UNDECLARED_OR_SUSPECT_CLASSIFICATION');
  assert.equal('record' in result, false);
});

test('KRN-POL-001 refuses authority and cross-tenant actions', () => {
  const authority = processEvidenceRequest(validRequest({ policy: { action: 'open the gate', requested_tool: 'KRN-REC-001', classification: 'green' } }), {
    createdAt: '2026-07-25T01:02:03.000Z',
  });
  assert.equal(authority.ok, false);
  assert.equal(authority.status, 'refused');
  assert.equal(authority.code, 'AUTHORITY_ACTION_REFUSED');

  const crossTenant = processEvidenceRequest(validRequest({ policy: { target_tenant: 'f521-syn-tenant-000002' } }), {
    createdAt: '2026-07-25T01:02:03.000Z',
  });
  assert.equal(crossTenant.ok, false);
  assert.equal(crossTenant.code, 'CROSS_TENANT_SCOPE_REFUSED');
});
