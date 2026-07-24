import {
  allStringsAreNfc,
  containsSuspectOrCanary,
  countFields,
  fail,
  isPlainObject,
  issueCorrelationId,
  sha256Binding,
  utf8ByteLength,
} from './common.mjs';

const STAGE = 'KRN-INT-001';
const GREEN_FIXTURE_ID = /^f521-syn-(?:tenant|agent|formula|case)-[0-9]{6}$/;
const LOCAL_COMMITMENT = /^local:[A-Za-z0-9_-]{16,200}$/;
const ALLOWED_CONTENT_TYPES = new Set(['application/json', 'text/yaml']);

export const DEFAULT_INTAKE_LIMITS = Object.freeze({ maxBytes: 64 * 1024, maxFields: 128 });

/**
 * Classifies an in-memory request without logging or persisting its body.
 * Green records receive a content digest; bounded local references must supply
 * a precomputed opaque local commitment rather than their underlying content.
 */
export function intakeRequest(request, { limits = DEFAULT_INTAKE_LIMITS } = {}) {
  const correlationId = issueCorrelationId();
  if (!isPlainObject(request) || !ALLOWED_CONTENT_TYPES.has(request.content_type)) {
    return fail(STAGE, 'INTAKE_SIZE_OR_SHAPE', 'REJECT', correlationId);
  }
  if (request.persistence_requested === true) return fail(STAGE, 'INTAKE_RAW_PERSISTENCE', 'CONTAIN', correlationId);

  const { classification } = request;
  if (classification !== 'green' && classification !== 'bounded-local-reference') {
    return fail(STAGE, 'INTAKE_NON_GREEN', 'CONTAIN', correlationId);
  }

  if (classification === 'bounded-local-reference') {
    if (!LOCAL_COMMITMENT.test(request.local_commitment ?? '')) {
      return fail(STAGE, 'INTAKE_SIZE_OR_SHAPE', 'REJECT', correlationId);
    }
    return Object.freeze({
      ok: true,
      stage: STAGE,
      status: 'accepted-reference',
      correlation_id: correlationId,
      input_binding: { kind: 'keyed_local_commitment', value: request.local_commitment },
    });
  }

  if (!GREEN_FIXTURE_ID.test(request.fixture_id ?? '')) {
    return fail(STAGE, 'INTAKE_NON_GREEN', 'CONTAIN', correlationId);
  }
  if (!isPlainObject(request.record)) return fail(STAGE, 'INTAKE_SIZE_OR_SHAPE', 'REJECT', correlationId);
  if (containsSuspectOrCanary(request.record)) return fail(STAGE, 'INTAKE_CANARY_OR_SUSPECT', 'CONTAIN', correlationId);
  if (!allStringsAreNfc(request.record)) return fail(STAGE, 'INTAKE_SIZE_OR_SHAPE', 'REJECT', correlationId);

  let byteLength;
  try {
    byteLength = utf8ByteLength(request.record);
  } catch {
    return fail(STAGE, 'INTAKE_SIZE_OR_SHAPE', 'REJECT', correlationId);
  }
  if (byteLength > limits.maxBytes || countFields(request.record) > limits.maxFields) {
    return fail(STAGE, 'INTAKE_SIZE_OR_SHAPE', 'REJECT', correlationId);
  }

  return Object.freeze({
    ok: true,
    stage: STAGE,
    status: 'accepted',
    correlation_id: correlationId,
    input_binding: { kind: 'approved_green_sha256', value: sha256Binding(request.record) },
    record: request.record,
  });
}
