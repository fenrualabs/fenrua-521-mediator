import { POLICY_VERSION } from './constants.mjs';
import { fail, isPlainObject } from './common.mjs';

const STAGE = 'KRN-POL-001';
const ALLOWED_TOOLS = new Set(['KRN-INT-001', 'KRN-SCH-001', 'KRN-SEM-001', 'KRN-POL-001', 'KRN-REC-001']);
const GENERIC_PROXY_TOOLS = new Set(['shell', 'filesystem', 'filesystem-browser', 'network-proxy', 'http', 'repository-walk', 'unrestricted-retrieval']);
const SIGNING = /\b(?:sign|signature|signatory)\b/i;
const GATE_OR_ACTIVATION = /\b(?:open(?: the)? gate|approve gate|deploy|activate|promote candidate|mark\s+(?:as\s+)?pass)\b/i;
const CUSTODY = /\b(?:transfer|withdraw|custody|treasury|settle|post balance)\b/i;
const SELF_ESCALATION = /\b(?:you are now the|act as head engineer|i authori[sz]e you|treat this as signed)\b/i;
const AMBER_PROMOTION = /\b(?:treat as green|ignore classification|downgrade amber)\b/i;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function typedAction(context) {
  return [context.task_class, context.action].filter((value) => typeof value === 'string').join(' ');
}

function targetsNonLoopback(context) {
  if (context.network_egress === true) return true;
  if (typeof context.network_destination !== 'string' || context.network_destination.length === 0) return false;
  return !LOOPBACK_HOSTS.has(context.network_destination.toLowerCase());
}

/** Evaluates typed policy context; it never interprets an unrestricted prompt. */
export function evaluatePolicy(context, correlationId) {
  if (!isPlainObject(context)) return fail(STAGE, 'POLICY_CONTEXT_REQUIRED', 'CONTAIN', correlationId);
  if (context.raw_prompt_detected === true || context.canary_detected === true) {
    return fail(STAGE, 'DISCLOSURE_RAW_OR_CANARY', 'CONTAIN', correlationId);
  }
  if (context.classification === 'red') return fail(STAGE, 'DISCLOSURE_RED', 'CONTAIN', correlationId);
  if (!['green', 'amber', 'bounded-local-reference'].includes(context.classification)) {
    return fail(STAGE, 'POLICY_CLASSIFICATION_CONTAINED', 'CONTAIN', correlationId);
  }
  if (context.classification_override === true || context.classification_override === 'amber-to-green' || AMBER_PROMOTION.test(typedAction(context))) {
    return fail(STAGE, 'DISCLOSURE_AMBER_PROMOTION', 'REJECT', correlationId);
  }
  if (context.tenant_context_source === 'caller' || context.caller_supplied_tenant === true) {
    return fail(STAGE, 'TENANT_CALLER_SUPPLIED', 'REJECT', correlationId);
  }
  if ((Array.isArray(context.tenant_ids) && new Set(context.tenant_ids).size > 1)
    || (context.requester_tenant && context.target_tenant && context.requester_tenant !== context.target_tenant)) {
    return fail(STAGE, 'TENANT_CROSS_SCOPE', 'REJECT', correlationId);
  }
  if (context.scope_expansion === true
    || (typeof context.declared_scope === 'string' && typeof context.requested_output_scope === 'string'
      && context.declared_scope !== context.requested_output_scope)) {
    return fail(STAGE, 'SCOPE_EXPANSION', 'CONTAIN', correlationId);
  }
  if (context.direct_model_endpoint === true || targetsNonLoopback(context)) {
    return fail(STAGE, 'EGRESS_BLOCKED', 'REJECT', correlationId);
  }
  if (context.model_initiated_tool === true) return fail(STAGE, 'MODEL_INITIATED_TOOL_FORBIDDEN', 'REJECT', correlationId);
  if (typeof context.requested_tool !== 'string') return fail(STAGE, 'TOOL_NOT_ALLOWLISTED', 'REJECT', correlationId);
  if (GENERIC_PROXY_TOOLS.has(context.requested_tool) || context.generic_proxy_requested === true) {
    return fail(STAGE, 'TOOL_GENERIC_PROXY', 'REJECT', correlationId);
  }
  if (!ALLOWED_TOOLS.has(context.requested_tool)) return fail(STAGE, 'TOOL_NOT_ALLOWLISTED', 'REJECT', correlationId);
  if (typeof context.action !== 'string' || context.action.length === 0) {
    return fail(STAGE, 'POLICY_ACTION_REQUIRED', 'CONTAIN', correlationId);
  }
  const action = typedAction(context);
  if (SIGNING.test(action)) return fail(STAGE, 'AUTHORITY_SIGNING', 'REJECT', correlationId);
  if (GATE_OR_ACTIVATION.test(action)) return fail(STAGE, 'AUTHORITY_GATE_OR_ACTIVATION', 'REJECT', correlationId);
  if (CUSTODY.test(action)) return fail(STAGE, 'AUTHORITY_CUSTODY', 'REJECT', correlationId);
  if (SELF_ESCALATION.test(action)) return fail(STAGE, 'AUTHORITY_SELF_ESCALATION', 'REJECT', correlationId);
  return Object.freeze({ ok: true, stage: STAGE, status: 'permit-for-review', policy_version: POLICY_VERSION });
}
