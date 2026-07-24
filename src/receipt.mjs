import { POLICY_VERSION, RECEIPT_VERSION, SEMANTIC_PROFILE_VERSION } from './constants.mjs';
import { canonicalRecord, sha256Binding } from './common.mjs';

const RESULTS = new Set(['verified', 'contained', 'refused']);

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
  return Object.freeze({ ...receipt, receipt_digest: receiptDigest, immutable_reference: receiptDigest, canonical: canonicalRecord(receipt) });
}
