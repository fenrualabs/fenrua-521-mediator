import { isPlainObject, sha256Binding } from './common.mjs';

const TOOL_ID = 'KRN-FML-001';
const INTERFACE_VERSION = 'fenrua-521-fml-001/v0.2';
const CONTRACT_VERSION = 'fenrua-521-formula-contract/v1';
const RECEIPT_VERSION = 'fenrua-521-formula-receipt/v1';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SAFE_REASON = /^[A-Z][A-Z0-9_]{2,120}$/;
const CORE_FORMULA_IDS = new Set([
  'F521-KEY-001',
  'F521-ID-001',
  'F521-EVENT-001',
  'F521-P521-001',
  'F521-NN-001',
  'F521-INGRESS-001',
  'F521-LEDGER-001',
  'F521-EPOCH-001',
  'F521-INCLUSION-001',
]);

function safeDigest(value) {
  try {
    return sha256Binding(value);
  } catch {
    return sha256Binding({ malformed: true });
  }
}

function safeFormulaId(value) {
  return CORE_FORMULA_IDS.has(value) ? value : 'UNKNOWN';
}

function safeVersion(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 ? value : 'UNSUPPORTED';
}

function validPublicResult(value) {
  return typeof value === 'boolean' || (typeof value === 'string' && DIGEST.test(value));
}

function validContract(contract, formulaId, version) {
  return isPlainObject(contract)
    && contract.formula_contract_version === CONTRACT_VERSION
    && contract.formula_id === formulaId
    && contract.version === version
    && typeof contract.source_id === 'string' && contract.source_id.length > 0 && contract.source_id.length <= 240
    && DIGEST.test(contract.source_digest)
    && DIGEST.test(contract.contract_digest)
    && contract.disclosure_class === 'amber'
    && typeof contract.local_verifier === 'function';
}

function createReceipt({ formulaId, version, disposition, reasonCode, publicInputs, contract }) {
  const receipt = {
    receipt_version: RECEIPT_VERSION,
    tool_id: TOOL_ID,
    interface_version: INTERFACE_VERSION,
    formula_id: formulaId,
    version,
    disposition,
    reason_code: reasonCode,
    public_inputs_digest: safeDigest(publicInputs),
    ...(contract ? { source_digest: contract.source_digest, contract_digest: contract.contract_digest } : {}),
  };
  const receiptDigest = sha256Binding(receipt);
  return Object.freeze({ ...receipt, receipt_digest: receiptDigest, immutable_reference: receiptDigest });
}

function result({ formulaId, version, disposition, reasonCode, publicInputs, contract, publicResult }) {
  const receipt = createReceipt({ formulaId, version, disposition, reasonCode, publicInputs, contract });
  return Object.freeze({
    disposition,
    reason_code: reasonCode,
    receipt_digest: receipt.receipt_digest,
    formula_id: formulaId,
    version,
    ...(publicResult !== undefined ? { public_result: publicResult } : {}),
    receipt,
  });
}

/**
 * Verifies a typed request only through a separately bound, local Amber Formula
 * Contract. No mathematical profile is embedded here and no prose can produce
 * a VERIFIED result.
 */
export function verifyFormulaContract(request, { resolveContract } = {}) {
  const formulaId = safeFormulaId(isPlainObject(request) ? request.formula_id : undefined);
  const version = safeVersion(isPlainObject(request) ? request.version : undefined);
  const publicInputs = isPlainObject(request) ? request.public_inputs : undefined;
  if (formulaId === 'UNKNOWN') return result({ formulaId, version, disposition: 'INSUFFICIENT_EVIDENCE', reasonCode: 'FML_UNKNOWN_FORMULA', publicInputs });
  if (!isPlainObject(publicInputs)) return result({ formulaId, version, disposition: 'REJECTED', reasonCode: 'FML_MALFORMED_PUBLIC_INPUTS', publicInputs });
  if (typeof resolveContract !== 'function') return result({ formulaId, version, disposition: 'INSUFFICIENT_EVIDENCE', reasonCode: 'FML_CONTRACT_UNBOUND', publicInputs });

  let contract;
  try {
    contract = resolveContract({ formula_id: formulaId, version });
  } catch {
    return result({ formulaId, version, disposition: 'INSUFFICIENT_EVIDENCE', reasonCode: 'FML_CONTRACT_UNAVAILABLE', publicInputs });
  }
  if (!validContract(contract, formulaId, version)) {
    return result({ formulaId, version, disposition: 'INSUFFICIENT_EVIDENCE', reasonCode: 'FML_CONTRACT_MISMATCH', publicInputs });
  }

  try {
    const verdict = contract.local_verifier(publicInputs);
    if (!isPlainObject(verdict) || typeof verdict.valid !== 'boolean' || !SAFE_REASON.test(verdict.reason_code ?? '')) {
      return result({ formulaId, version, disposition: 'REJECTED', reasonCode: 'FML_INVALID_LOCAL_VERDICT', publicInputs, contract });
    }
    if (verdict.public_result !== undefined && !validPublicResult(verdict.public_result)) {
      return result({ formulaId, version, disposition: 'REJECTED', reasonCode: 'FML_INVALID_LOCAL_VERDICT', publicInputs, contract });
    }
    if (!verdict.valid) return result({ formulaId, version, disposition: 'REJECTED', reasonCode: verdict.reason_code, publicInputs, contract });
    return result({ formulaId, version, disposition: 'VERIFIED', reasonCode: verdict.reason_code, publicInputs, contract, publicResult: verdict.public_result });
  } catch {
    return result({ formulaId, version, disposition: 'REJECTED', reasonCode: 'FML_LOCAL_VERIFIER_REJECTED', publicInputs, contract });
  }
}

export const CORE_FORMULA_CONTRACT_IDS = Object.freeze([...CORE_FORMULA_IDS]);
