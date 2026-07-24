import { POLICY_VERSION } from './constants.mjs';
import { fail, isPlainObject } from './common.mjs';

const STAGE = 'KRN-POL-001';
const ALLOWED_TOOLS = new Set(['KRN-INT-001', 'KRN-SCH-001', 'KRN-SEM-001', 'KRN-POL-001', 'KRN-REC-001']);
const AUTHORITY_ACTION = /\b(?:approve|sign|deploy|activate|open(?: the)? gate|custody|treasury|transfer|withdraw|mark\s+(?:as\s+)?pass)\b/i;

/** Evaluates typed policy context; it never interprets an unrestricted prompt. */
export function evaluatePolicy(context, correlationId) {
  if (!isPlainObject(context)) return fail(STAGE, 'POLICY_CONTEXT_REQUIRED', 'CONTAIN', correlationId);
  if (!['green', 'bounded-local-reference'].includes(context.classification)) {
    return fail(STAGE, 'POLICY_CLASSIFICATION_CONTAINED', 'CONTAIN', correlationId);
  }
  if (context.network_egress === true || context.direct_model_endpoint === true) {
    return fail(STAGE, 'EXTERNAL_EGRESS_OR_DIRECT_ENDPOINT_FORBIDDEN', 'CONTAIN', correlationId);
  }
  if (context.model_initiated_tool === true) {
    return fail(STAGE, 'MODEL_INITIATED_TOOL_FORBIDDEN', 'REJECT', correlationId);
  }
  if (typeof context.requested_tool !== 'string' || !ALLOWED_TOOLS.has(context.requested_tool)) {
    return fail(STAGE, 'TOOL_NOT_ALLOWLISTED', 'REJECT', correlationId);
  }
  if (typeof context.action !== 'string' || context.action.length === 0) {
    return fail(STAGE, 'POLICY_ACTION_REQUIRED', 'CONTAIN', correlationId);
  }
  if (AUTHORITY_ACTION.test(context.action)) return fail(STAGE, 'AUTHORITY_ACTION_REFUSED', 'REJECT', correlationId);
  if (context.requester_tenant && context.target_tenant && context.requester_tenant !== context.target_tenant) {
    return fail(STAGE, 'CROSS_TENANT_SCOPE_REFUSED', 'REJECT', correlationId);
  }
  return Object.freeze({ ok: true, stage: STAGE, status: 'permit-for-review', policy_version: POLICY_VERSION });
}
