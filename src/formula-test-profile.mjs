import crypto from 'node:crypto';

import { isPlainObject, sha256Binding } from './common.mjs';

export const TEST_PROFILE_ID = 'F521-FML-TEST-PROFILE-001';
export const TEST_PROFILE_VERSION = 'test-v1';
export const TEST_PROFILE_SOURCE_ID = 'fenrua-521-fml-001-test-profile-contracts-v0.3';
export const TEST_PROFILE_DIGEST = 'sha256:402ff1661e563b55f9ced922415fd5f110e243f1b306f61a9739eabc4ad83353';
export const TEST_PROFILE_VECTOR_SET_DIGEST = 'sha256:8ee154f0904172f1bd3683830538f083001bd97675766c22353870e27e421d3c';

const TOOL_ID = 'KRN-FML-001';
const RECEIPT_VERSION = 'fenrua-521-formula-test-profile-receipt/v1';
const BYTE_HEX = /^[0-9a-f]{64}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const DECIMAL_U64 = /^(0|[1-9][0-9]{0,19})$/;
const MAX_U64 = (1n << 64n) - 1n;
const MAX_U32 = (1n << 32n) - 1n;
const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const SECP256K1_HALF_N = (SECP256K1_N - 1n) / 2n;
const FORMULA_IDS = new Set(['F521-TEST-EVENT-001', 'F521-TEST-NULL-001', 'F521-TEST-SIG-001', 'F521-TEST-MERKLE-001', 'F521-TEST-INCL-001']);

function isExactObject(value, fields) {
  return isPlainObject(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function isU64(value) {
  return typeof value === 'string' && DECIMAL_U64.test(value) && BigInt(value) <= MAX_U64;
}

function isU32(value) {
  return Number.isInteger(value) && value >= 0 && BigInt(value) <= MAX_U32;
}

function isDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function asBytes(value) {
  return Buffer.from(value, 'hex');
}

function digestWithDomain(domain, ...parts) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.concat([Buffer.from(`${domain}\0`, 'utf8'), ...parts])).digest('hex')}`;
}

function digestPayload(value) {
  return asBytes(value.slice('sha256:'.length));
}

function u64be(value) {
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(BigInt(value));
  return encoded;
}

function u32be(value) {
  const encoded = Buffer.alloc(4);
  encoded.writeUInt32BE(value);
  return encoded;
}

function merkleLeaf(value) {
  return digestWithDomain('F521_TEST_MERKLE_LEAF_V1', asBytes(value));
}

function merkleNode(left, right) {
  return digestWithDomain('F521_TEST_MERKLE_NODE_V1', digestPayload(left), digestPayload(right));
}

function merkleRoot(leaves) {
  if (!Array.isArray(leaves) || leaves.length !== 2 || !leaves.every((entry) => typeof entry === 'string' && BYTE_HEX.test(entry))) return null;
  return merkleNode(merkleLeaf(leaves[0]), merkleLeaf(leaves[1]));
}

function verifyEvent(input) {
  const fields = ['C_t', 'A_t', 'q', 'H_X', 'nu', 'claimed_commitment'];
  if (!isExactObject(input, fields) || ![input.C_t, input.A_t, input.H_X, input.nu].every((value) => typeof value === 'string' && BYTE_HEX.test(value)) || !isU64(input.q) || !isDigest(input.claimed_commitment)) return { valid: false, reason_code: 'FML_TEST_EVENT_MALFORMED' };
  const computed = digestWithDomain('F521_TEST_EVENT_V1', asBytes(input.C_t), asBytes(input.A_t), u64be(input.q), asBytes(input.H_X), asBytes(input.nu));
  return computed === input.claimed_commitment ? { valid: true, reason_code: 'FML_TEST_EVENT_MATCH', public_result: computed } : { valid: false, reason_code: 'FML_TEST_EVENT_MISMATCH' };
}

function verifyNullifier(input, session) {
  const fields = ['A_t', 'q', 'e', 'claimed_nullifier', 'synthetic_namespace'];
  if (!isExactObject(input, fields) || typeof input.A_t !== 'string' || !BYTE_HEX.test(input.A_t) || !isU64(input.q) || !isU32(input.e) || !isDigest(input.claimed_nullifier) || typeof input.synthetic_namespace !== 'string' || !/^f521-test-[a-z0-9-]{1,80}$/.test(input.synthetic_namespace)) return { valid: false, reason_code: 'FML_TEST_NULL_MALFORMED' };
  const computed = digestWithDomain('F521_TEST_NULL_V1', asBytes(input.A_t), u64be(input.q), u32be(input.e));
  if (computed !== input.claimed_nullifier) return { valid: false, reason_code: 'FML_TEST_NULL_MISMATCH' };
  const replayKey = `${input.synthetic_namespace}:${computed}`;
  if (session.used_nullifiers.has(replayKey)) return { valid: false, reason_code: 'FML_TEST_NULL_REPLAY' };
  session.used_nullifiers.add(replayKey);
  return { valid: true, reason_code: 'FML_TEST_NULL_MATCH', public_result: computed };
}

function verifySignatureCanonicality(input) {
  const fields = ['curve', 'r', 's'];
  if (!isExactObject(input, fields) || input.curve !== 'secp256k1' || ![input.r, input.s].every((value) => typeof value === 'string' && BYTE_HEX.test(value))) return { valid: false, reason_code: 'FML_TEST_SIG_MALFORMED' };
  const r = BigInt(`0x${input.r}`);
  const s = BigInt(`0x${input.s}`);
  if (r < 1n || r >= SECP256K1_N) return { valid: false, reason_code: 'FML_TEST_SIG_R_RANGE' };
  if (s < 1n || s > SECP256K1_HALF_N) return { valid: false, reason_code: 'FML_TEST_SIG_HIGH_S' };
  return { valid: true, reason_code: 'FML_TEST_SIG_CANONICAL', public_result: true };
}

function verifyMerkleRoot(input) {
  if (!isExactObject(input, ['leaves', 'claimed_root']) || !isDigest(input.claimed_root)) return { valid: false, reason_code: 'FML_TEST_MERKLE_MALFORMED' };
  const computed = merkleRoot(input.leaves);
  if (!computed) return { valid: false, reason_code: 'FML_TEST_MERKLE_MALFORMED' };
  return computed === input.claimed_root ? { valid: true, reason_code: 'FML_TEST_MERKLE_MATCH', public_result: computed } : { valid: false, reason_code: 'FML_TEST_MERKLE_MISMATCH' };
}

function verifyInclusion(input) {
  if (!isExactObject(input, ['leaf', 'root', 'path']) || typeof input.leaf !== 'string' || !BYTE_HEX.test(input.leaf) || !isDigest(input.root) || !Array.isArray(input.path) || input.path.length !== 1) return { valid: false, reason_code: 'FML_TEST_INCL_MALFORMED' };
  const [step] = input.path;
  if (!isExactObject(step, ['side', 'sibling']) || step.side !== 'left' || typeof step.sibling !== 'string' || !BYTE_HEX.test(step.sibling)) return { valid: false, reason_code: 'FML_TEST_INCL_MALFORMED' };
  // `side: left` means the current node is the left child and sibling is right.
  const computed = merkleNode(merkleLeaf(input.leaf), merkleLeaf(step.sibling));
  return computed === input.root ? { valid: true, reason_code: 'FML_TEST_INCL_VALID', public_result: computed } : { valid: false, reason_code: 'FML_TEST_INCL_INVALID' };
}

const VERIFIERS = Object.freeze({
  'F521-TEST-EVENT-001': verifyEvent,
  'F521-TEST-NULL-001': verifyNullifier,
  'F521-TEST-SIG-001': verifySignatureCanonicality,
  'F521-TEST-MERKLE-001': verifyMerkleRoot,
  'F521-TEST-INCL-001': verifyInclusion,
});

export function createFormulaTestProfileSession() {
  return { used_nullifiers: new Set() };
}

function createReceipt({ formulaId, version, disposition, reasonCode, publicInputs }) {
  const receipt = {
    receipt_version: RECEIPT_VERSION,
    tool_id: TOOL_ID,
    test_profile_id: TEST_PROFILE_ID,
    test_profile_version: TEST_PROFILE_VERSION,
    test_profile_digest: TEST_PROFILE_DIGEST,
    vector_set_digest: TEST_PROFILE_VECTOR_SET_DIGEST,
    formula_id: formulaId,
    version,
    disposition,
    reason_code: reasonCode,
    public_inputs_digest: sha256Binding(publicInputs ?? null),
    receipt_digest: '',
  };
  receipt.receipt_digest = sha256Binding(receipt);
  return Object.freeze(receipt);
}

function result({ formulaId, version, disposition, reasonCode, publicInputs, publicResult }) {
  const receipt = createReceipt({ formulaId, version, disposition, reasonCode, publicInputs });
  return Object.freeze({ disposition, reason_code: reasonCode, receipt_digest: receipt.receipt_digest, formula_id: formulaId, version, assurance_level: 'reference', ...(publicResult !== undefined ? { public_result: publicResult } : {}), receipt });
}

/** Runs only explicit synthetic profile contracts and can never emit VERIFIED. */
export function verifyFormulaTestProfile(request, { session } = {}) {
  const formulaId = isPlainObject(request) && FORMULA_IDS.has(request.formula_id) ? request.formula_id : 'UNKNOWN';
  const version = isPlainObject(request) && typeof request.version === 'string' ? request.version : 'UNSUPPORTED';
  const publicInputs = isPlainObject(request) ? request.public_inputs : undefined;
  if (formulaId === 'UNKNOWN') return result({ formulaId, version, disposition: 'INSUFFICIENT_EVIDENCE', reasonCode: 'FML_TEST_UNKNOWN_FORMULA', publicInputs });
  if (version !== TEST_PROFILE_VERSION) return result({ formulaId, version, disposition: 'INSUFFICIENT_EVIDENCE', reasonCode: 'FML_TEST_VERSION_UNBOUND', publicInputs });
  if (!isPlainObject(publicInputs)) return result({ formulaId, version, disposition: 'REJECTED', reasonCode: 'FML_TEST_MALFORMED_PUBLIC_INPUTS', publicInputs });
  const activeSession = session ?? createFormulaTestProfileSession();
  if (!isPlainObject(activeSession) || !(activeSession.used_nullifiers instanceof Set)) return result({ formulaId, version, disposition: 'INSUFFICIENT_EVIDENCE', reasonCode: 'FML_TEST_SESSION_UNBOUND', publicInputs });
  try {
    const verdict = VERIFIERS[formulaId](publicInputs, activeSession);
    if (!isPlainObject(verdict) || typeof verdict.valid !== 'boolean' || typeof verdict.reason_code !== 'string') return result({ formulaId, version, disposition: 'REJECTED', reasonCode: 'FML_TEST_INVALID_LOCAL_VERDICT', publicInputs });
    return verdict.valid
      ? result({ formulaId, version, disposition: 'REFERENCE_VERIFIED', reasonCode: verdict.reason_code, publicInputs, publicResult: verdict.public_result })
      : result({ formulaId, version, disposition: 'REJECTED', reasonCode: verdict.reason_code, publicInputs });
  } catch {
    return result({ formulaId, version, disposition: 'REJECTED', reasonCode: 'FML_TEST_LOCAL_VERIFIER_REJECTED', publicInputs });
  }
}

export const TEST_PROFILE_FORMULA_IDS = Object.freeze([...FORMULA_IDS]);
