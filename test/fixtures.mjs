import { EVIDENCE_DISPOSITION_SCHEMA_DIGEST } from '../src/constants.mjs';

export function validRecord(overrides = {}) {
  const digest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const record = {
    record_version: 'fenrua-521-disposition/v1',
    record_id: 'f521-syn-case-000001-record',
    created_at: '2026-07-25T00:00:00.000Z',
    actor: { type: 'kernel_tool', identifier: 'f521-syn-agent-000001' },
    claim_scope: 'Review a synthetic evidence record.',
    disposition: 'EVIDENCE_SUFFICIENT_FOR_REVIEW',
    authority_status: 'human_decision_required',
    facts: [{
      fact_id: 'F-001',
      statement: 'A synthetic record exists.',
      evidence_ref: 'f521-syn-formula-000001',
      source_digest: digest,
      verification: 'kernel_verified',
      disclosure_class: 'green',
    }],
    inferences: [],
    evidence_refs: [{ id: 'f521-syn-formula-000001', digest, classification: 'green' }],
    missing_evidence: [],
    conflicts: [],
    risks: [],
    permitted_next_steps: ['A human may review the synthetic record.'],
    prohibited_actions: ['Do not activate or approve anything.'],
    integrity: {
      schema_digest: EVIDENCE_DISPOSITION_SCHEMA_DIGEST,
      parent_record_refs: [],
      source_bindings: [{ source_id: 'f521-syn-formula-000001', source_digest: digest, classification: 'green' }],
    },
  };
  return merge(record, overrides);
}

function merge(target, source) {
  const result = structuredClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = merge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function validRequest(overrides = {}) {
  const request = {
    classification: 'green',
    fixture_id: 'f521-syn-case-000001',
    record: validRecord(),
    policy: {
      classification: 'green',
      action: 'produce a bounded review package',
      requested_tool: 'KRN-REC-001',
      requester_tenant: 'f521-syn-tenant-000001',
      target_tenant: 'f521-syn-tenant-000001',
      network_egress: false,
      direct_model_endpoint: false,
      model_initiated_tool: false,
    },
  };
  return merge(request, overrides);
}
