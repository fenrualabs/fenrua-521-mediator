import {
  allStringsAreNfc,
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

export const DEFAULT_INTAKE_LIMITS = Object.freeze({ maxBytes: 64 * 1024, maxFields: 512 });

/**
 * Classifies an in-memory request without logging or persisting its body.
 * Green records receive a content digest; bounded local references must supply
 * a precomputed opaque local commitment rather than their underlying content.
 */
export function intakeRequest(request, { limits = DEFAULT_INTAKE_LIMITS } = {}) {
  const correlationId = issueCorrelationId();
  if (!isPlainObject(request)) return fail(STAGE, 'MALFORMED_REQUEST_ENVELOPE', 'CONTAIN', correlationId);

  const { classification } = request;
  if (classification !== 'green' && classification !== 'bounded-local-reference') {
    return fail(STAGE, 'UNDECLARED_OR_SUSPECT_CLASSIFICATION', 'CONTAIN', correlationId);
  }

  if (classification === 'bounded-local-reference') {
    if (!LOCAL_COMMITMENT.test(request.local_commitment ?? '')) {
      return fail(STAGE, 'INVALID_LOCAL_COMMITMENT', 'CONTAIN', correlationId);
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
    return fail(STAGE, 'UNDECLARED_GREEN_FIXTURE', 'CONTAIN', correlationId);
  }
  if (!isPlainObject(request.record)) return fail(STAGE, 'MISSING_TYPED_RECORD', 'CONTAIN', correlationId);
  if (!allStringsAreNfc(request.record)) return fail(STAGE, 'UNNORMALIZED_UNICODE', 'CONTAIN', correlationId);

  let byteLength;
  try {
    byteLength = utf8ByteLength(request.record);
  } catch {
    return fail(STAGE, 'NON_CANONICAL_REQUEST_VALUE', 'CONTAIN', correlationId);
  }
  if (byteLength > limits.maxBytes) return fail(STAGE, 'REQUEST_SIZE_LIMIT_EXCEEDED', 'CONTAIN', correlationId);
  if (countFields(request.record) > limits.maxFields) return fail(STAGE, 'REQUEST_FIELD_LIMIT_EXCEEDED', 'CONTAIN', correlationId);

  return Object.freeze({
    ok: true,
    stage: STAGE,
    status: 'accepted',
    correlation_id: correlationId,
    input_binding: { kind: 'approved_green_sha256', value: sha256Binding(request.record) },
    record: request.record,
  });
}
