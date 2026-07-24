import { isPlainObject, sha256Binding } from './common.mjs';

export const ENVELOPE_VERSION = 'fenrua-521-envelope/v1';
export const ENVELOPE_SCHEMA_DIGEST = 'sha256:3a1e270a1cf2ecf444b5cfafd92eeab0866ea6eb9ba62fa78edd4fc52adf437e';
export const ENVELOPE_PROFILE_DIGEST = 'sha256:d5f23f9fbc9d70c4bc0f8518d86acf7a5becedf456973b80dc1ca3e6aac89ed5';

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const LOCAL_COMMITMENT = /^hmac-sha256:[a-f0-9]{64}$/;
const CORRELATION = /^[A-Za-z0-9._:-]{16,160}$/;
const TASK_CLASSES = new Set(['classify', 'explain', 'evaluate', 'verify', 'generate_synthetic_fixture']);
const CLASSIFICATIONS = new Set(['green', 'amber_local']);
const RECIPIENT_TYPES = new Set(['policy_mediator', 'kernel_tool', 'capability_engine']);

function safeDigest(value) {
  try {
    return sha256Binding(value);
  } catch {
    return sha256Binding({ malformed_envelope: true });
  }
}

function verdict(accepted, code, envelope, now) {
  const receipt = {
    receipt_version: 'fenrua-521-envelope-validation-receipt/v1',
    tool_id: 'KRN-ENV-001',
    envelope_version: ENVELOPE_VERSION,
    outcome: accepted ? 'ACCEPT' : 'REJECT',
    reason_code: code,
    envelope_digest: safeDigest(envelope),
    received_at: now.toISOString(),
    receipt_digest: '',
  };
  receipt.receipt_digest = sha256Binding(receipt);
  return Object.freeze({ accepted, outcome: receipt.outcome, code, receipt_digest: receipt.receipt_digest, receipt: Object.freeze(receipt) });
}

function normalizeConfig(config) {
  if (!isPlainObject(config) || typeof config.recipient_id !== 'string' || config.recipient_id.length < 1 || config.recipient_id.length > 160 || !Array.isArray(config.approved_senders) || !Array.isArray(config.approved_green_bindings) || !Array.isArray(config.approved_keyed_commitments) || !Array.isArray(config.allowed_output_schemas)) return null;
  const now = config.now === undefined ? new Date() : new Date(config.now);
  if (Number.isNaN(now.getTime())) return null;
  const senders = new Set();
  for (const sender of config.approved_senders) {
    if (!isPlainObject(sender) || typeof sender.engine_id !== 'string' || !DIGEST.test(sender.candidate_digest)) return null;
    senders.add(`${sender.engine_id}:${sender.candidate_digest}`);
  }
  if (!config.approved_green_bindings.every((value) => DIGEST.test(value)) || !config.approved_keyed_commitments.every((value) => LOCAL_COMMITMENT.test(value)) || !config.allowed_output_schemas.every((value) => typeof value === 'string' && value.length > 0 && value.length <= 240)) return null;
  return {
    now,
    recipient_id: config.recipient_id,
    approved_senders: senders,
    approved_green_bindings: new Set(config.approved_green_bindings),
    approved_keyed_commitments: new Set(config.approved_keyed_commitments),
    allowed_output_schemas: new Set(config.allowed_output_schemas),
  };
}

function validBinding(binding) {
  return isPlainObject(binding) && Object.keys(binding).length === 2 && typeof binding.kind === 'string' && typeof binding.value === 'string';
}

function bindingAllowed(binding, classification, config) {
  const expectedKind = classification === 'green' ? 'approved_green_sha256' : 'keyed_local_commitment';
  if (!validBinding(binding) || binding.kind !== expectedKind) return 'ENVELOPE_BINDING_KIND_MISMATCH';
  if (classification === 'green') return DIGEST.test(binding.value) && config.approved_green_bindings.has(binding.value) ? null : 'ENVELOPE_BINDING_UNAPPROVED';
  return LOCAL_COMMITMENT.test(binding.value) && config.approved_keyed_commitments.has(binding.value) ? null : 'ENVELOPE_BINDING_UNAPPROVED';
}

function validSourceBindings(value, classification) {
  if (!Array.isArray(value)) return false;
  return value.every((binding) => isPlainObject(binding)
    && Object.keys(binding).length === 3
    && typeof binding.source_id === 'string' && binding.source_id.length > 0 && binding.source_id.length <= 240
    && DIGEST.test(binding.source_digest)
    && (binding.classification === 'green' || binding.classification === 'amber')
    && (classification !== 'green' || binding.classification === 'green'));
}

/**
 * Validates a typed inter-engine envelope against explicit local approvals.
 * It never trusts a sender, Green digest, keyed commitment, recipient, or
 * output schema merely because it is syntactically well formed.
 */
export function validateInterEngineEnvelope(envelope, config) {
  const normalized = normalizeConfig(config);
  const now = normalized?.now ?? new Date(0);
  if (!normalized) return verdict(false, 'ENVELOPE_VALIDATOR_UNCONFIGURED', envelope, now);
  if (!isPlainObject(envelope)) return verdict(false, 'ENVELOPE_SCHEMA_INVALID', envelope, now);
  if (envelope.envelope_version !== ENVELOPE_VERSION) return verdict(false, 'ENVELOPE_VERSION_UNSUPPORTED', envelope, now);
  if (typeof envelope.correlation_id !== 'string' || !CORRELATION.test(envelope.correlation_id)) return verdict(false, 'ENVELOPE_MISSING_CORRELATION_ID', envelope, now);
  if (!isPlainObject(envelope.sender) || typeof envelope.sender.engine_id !== 'string' || !DIGEST.test(envelope.sender.candidate_digest)) return verdict(false, 'ENVELOPE_SENDER_INVALID', envelope, now);
  if (!normalized.approved_senders.has(`${envelope.sender.engine_id}:${envelope.sender.candidate_digest}`)) return verdict(false, 'ENVELOPE_SENDER_UNAPPROVED', envelope, now);
  if (!isPlainObject(envelope.recipient) || !RECIPIENT_TYPES.has(envelope.recipient.type) || envelope.recipient.id !== normalized.recipient_id) return verdict(false, 'ENVELOPE_RECIPIENT_MISMATCH', envelope, now);
  if (!isPlainObject(envelope.task) || typeof envelope.task.class !== 'string' || !TASK_CLASSES.has(envelope.task.class)) return verdict(false, 'ENVELOPE_TASK_CLASS_FORBIDDEN', envelope, now);
  if (typeof envelope.task.scope !== 'string' || envelope.task.scope.length < 1 || envelope.task.scope.length > 4000) return verdict(false, 'ENVELOPE_SCHEMA_INVALID', envelope, now);
  if (!CLASSIFICATIONS.has(envelope.classification)) return verdict(false, 'ENVELOPE_CLASSIFICATION_INVALID', envelope, now);
  if (!validSourceBindings(envelope.source_bindings, envelope.classification)) return verdict(false, 'ENVELOPE_SOURCE_BINDINGS_INVALID', envelope, now);
  const inputBindingProblem = bindingAllowed(envelope.input_binding, envelope.classification, normalized);
  if (inputBindingProblem) return verdict(false, inputBindingProblem, envelope, now);
  if (!isPlainObject(envelope.integrity) || Object.keys(envelope.integrity).length !== 1) return verdict(false, 'ENVELOPE_INTEGRITY_INVALID', envelope, now);
  const requestBindingProblem = bindingAllowed(envelope.integrity.request_binding, envelope.classification, normalized);
  if (requestBindingProblem) return verdict(false, requestBindingProblem, envelope, now);
  if (typeof envelope.requested_output_schema !== 'string' || !normalized.allowed_output_schemas.has(envelope.requested_output_schema)) return verdict(false, 'ENVELOPE_OUTPUT_SCHEMA_FORBIDDEN', envelope, now);
  if (typeof envelope.expiry !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(envelope.expiry) || Number.isNaN(Date.parse(envelope.expiry))) return verdict(false, 'ENVELOPE_EXPIRY_INVALID', envelope, now);
  if (Date.parse(envelope.expiry) <= now.getTime()) return verdict(false, 'ENVELOPE_EXPIRED', envelope, now);
  return verdict(true, 'ENVELOPE_ACCEPTED', envelope, now);
}
