import {
  EVIDENCE_DISPOSITION_SCHEMA_VERSION,
  POLICY_VERSION,
  RECEIPT_VERSION,
  SEMANTIC_PROFILE_VERSION,
} from './constants.mjs';
import { sha256Binding } from './common.mjs';

const RESULTS = new Set(['verified', 'contained', 'refused']);
const APPROVED_GREEN_BINDING = /^sha256:[a-f0-9]{64}$/;
const LOCAL_COMMITMENT = /^local:[A-Za-z0-9_-]{16,200}$/;
const CORRELATION_ID = /^krn-[0-9a-f-]{36}$/;
const RFC_3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const FULL_STAGE_ORDER = ['KRN-INT-001', 'KRN-SCH-001', 'KRN-SEM-001', 'KRN-POL-001', 'KRN-REC-001'];

function validInputBinding(binding) {
  return binding && typeof binding === 'object'
    && ((binding.kind === 'approved_green_sha256' && APPROVED_GREEN_BINDING.test(binding.value))
      || (binding.kind === 'keyed_local_commitment' && LOCAL_COMMITMENT.test(binding.value)));
}

function validStages(result, stages) {
  if (!Array.isArray(stages) || stages[0] !== 'KRN-INT-001' || stages.at(-1) !== 'KRN-REC-001') return false;
  if (result === 'verified') return stages.length === FULL_STAGE_ORDER.length && stages.every((stage, index) => stage === FULL_STAGE_ORDER[index]);
  return stages.every((stage, index) => FULL_STAGE_ORDER.includes(stage) && (index === 0 || FULL_STAGE_ORDER.indexOf(stage) > FULL_STAGE_ORDER.indexOf(stages[index - 1])));
}

/** Creates a bounded receipt but deliberately does not persist it. */
export function createReceipt({
  correlationId,
  inputBinding,
  schemaVersion,
  semanticProfileVersion = SEMANTIC_PROFILE_VERSION,
  policyVersion = POLICY_VERSION,
  result,
  stages,
  createdAt = new Date().toISOString(),
}) {
  if (!RESULTS.has(result)) throw new TypeError('Receipt result must be verified, contained, or refused.');
  if (!CORRELATION_ID.test(correlationId ?? '')) throw new TypeError('Receipt correlation ID must be an opaque intake ID.');
  if (!validInputBinding(inputBinding)) throw new TypeError('Receipt input binding must be an approved Green digest or local commitment.');
  if (schemaVersion !== EVIDENCE_DISPOSITION_SCHEMA_VERSION) throw new TypeError('Receipt schema version is not pinned.');
  if (semanticProfileVersion !== SEMANTIC_PROFILE_VERSION || policyVersion !== POLICY_VERSION) {
    throw new TypeError('Receipt profile version is not pinned.');
  }
  if (!RFC_3339.test(createdAt) || Number.isNaN(Date.parse(createdAt))) throw new TypeError('Receipt timestamp must be RFC-3339.');
  if (!validStages(result, stages)) throw new TypeError('Receipt stage ordering is invalid for this result.');
  const receipt = {
    receipt_version: RECEIPT_VERSION,
    correlation_id: correlationId,
    input_binding: inputBinding,
    schema_version: schemaVersion,
    semantic_profile_version: semanticProfileVersion,
    policy_version: policyVersion,
    result,
    stages: [...stages],
    created_at: createdAt,
  };
  const receiptDigest = sha256Binding(receipt);
  return Object.freeze({ ...receipt, receipt_digest: receiptDigest, immutable_reference: receiptDigest });
}
