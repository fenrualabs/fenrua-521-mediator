import crypto from 'node:crypto';

import { isPlainObject, sha256Binding } from './common.mjs';

export const REFERENCE_EVENT_FORMULA_ID = 'F521-EVENT-001';
export const REFERENCE_EVENT_VERSION = 'reference-v1';
export const REFERENCE_EVENT_SOURCE_ID = 'f521-event-reference-profile-v0.1';
export const REFERENCE_EVENT_PROFILE_DIGEST = 'sha256:6c24c6b30bb5926533f6fa6603a86dde5f0475ab01d8b35b99fd04237d79db98';
export const REFERENCE_EVENT_VECTOR_SET_DIGEST = 'sha256:9b9a15db62c43ef8a7078ed0b6c3b13ebfd4263d127d150b303d0618efa175b1';

const BYTE_HEX = /^[0-9a-f]{64}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const DECIMAL_U64 = /^(0|[1-9][0-9]{0,19})$/;
const MAX_U64 = (1n << 64n) - 1n;
const EVENT_FIELDS = ['C_t', 'A_t', 'q', 'H_X', 'nu', 'claimed_commitment'];
const DOMAIN = Buffer.from('F521-REFERENCE-EVENT-V1\0', 'utf8');

function isCanonicalEventInput(value) {
  if (!isPlainObject(value) || Object.keys(value).length !== EVENT_FIELDS.length) return false;
  if (EVENT_FIELDS.some((field) => !(field in value))) return false;
  if (![value.C_t, value.A_t, value.H_X, value.nu].every((field) => typeof field === 'string' && BYTE_HEX.test(field))) return false;
  if (typeof value.q !== 'string' || !DECIMAL_U64.test(value.q)) return false;
  if (BigInt(value.q) > MAX_U64) return false;
  return typeof value.claimed_commitment === 'string' && SHA256.test(value.claimed_commitment);
}

function uint64be(value) {
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(BigInt(value));
  return encoded;
}

/** Returns the only digest accepted by the F521 event reference profile. */
export function computeReferenceEventCommitment(publicInputs) {
  if (!isCanonicalEventInput(publicInputs)) throw new TypeError('F521 event reference inputs are not canonical.');
  const bytes = Buffer.concat([
    DOMAIN,
    Buffer.from(publicInputs.C_t, 'hex'),
    Buffer.from(publicInputs.A_t, 'hex'),
    uint64be(publicInputs.q),
    Buffer.from(publicInputs.H_X, 'hex'),
    Buffer.from(publicInputs.nu, 'hex'),
  ]);
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

export function verifyReferenceEvent(publicInputs) {
  if (!isCanonicalEventInput(publicInputs)) return { valid: false, reason_code: 'FML_REFERENCE_EVENT_MALFORMED' };
  const computed = computeReferenceEventCommitment(publicInputs);
  if (computed !== publicInputs.claimed_commitment) return { valid: false, reason_code: 'FML_REFERENCE_EVENT_MISMATCH', public_result: computed };
  return { valid: true, reason_code: 'FML_REFERENCE_EVENT_MATCH', public_result: computed };
}

/**
 * A deterministic local contract for collecting reference evidence. It cannot
 * emit a production VERIFIED result because its assurance level is reference.
 */
export function createReferenceEventContract() {
  const contractBinding = {
    formula_contract_version: 'fenrua-521-formula-contract/v1',
    formula_id: REFERENCE_EVENT_FORMULA_ID,
    version: REFERENCE_EVENT_VERSION,
    source_id: REFERENCE_EVENT_SOURCE_ID,
    source_digest: REFERENCE_EVENT_PROFILE_DIGEST,
    disclosure_class: 'amber',
    assurance_level: 'reference',
    evidence: {
      reference_profile_digest: REFERENCE_EVENT_PROFILE_DIGEST,
      vector_set_digest: REFERENCE_EVENT_VECTOR_SET_DIGEST,
    },
  };
  return Object.freeze({
    ...contractBinding,
    contract_digest: sha256Binding(contractBinding),
    local_verifier: verifyReferenceEvent,
  });
}
