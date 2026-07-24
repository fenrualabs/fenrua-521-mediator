import { EVIDENCE_DISPOSITION_SCHEMA_VERSION } from './constants.mjs';
import { intakeRequest } from './intake.mjs';
import { evaluatePolicy } from './policy.mjs';
import { createReceipt } from './receipt.mjs';
import { validateEvidenceDisposition } from './schema.mjs';
import { validateSemantics } from './semantic.mjs';

function boundedBinding(intake) {
  return intake?.input_binding ?? { kind: 'unavailable', value: 'not-recorded' };
}

function terminal(intake, outcome, stages, createdAt) {
  const result = outcome.status === 'contained' ? 'contained' : 'refused';
  return Object.freeze({
    ok: false,
    status: result,
    stage: outcome.stage,
    code: outcome.code,
    correlation_id: intake?.correlation_id ?? outcome.correlation_id,
    receipt: createReceipt({
      correlationId: intake?.correlation_id ?? outcome.correlation_id ?? 'unavailable',
      inputBinding: boundedBinding(intake),
      schemaVersion: EVIDENCE_DISPOSITION_SCHEMA_VERSION,
      result,
      stages: [...stages, 'KRN-REC-001'],
      createdAt,
    }),
  });
}

/**
 * Runs the complete deterministic five-stage path. The returned value contains
 * no input record and this function never calls a model, tool, or network API.
 */
export function processEvidenceRequest(request, { createdAt } = {}) {
  const intake = intakeRequest(request);
  if (!intake.ok) return terminal(intake, intake, [intake.stage], createdAt);
  if (intake.status !== 'accepted') {
    return terminal(intake, { stage: intake.stage, status: 'contained', code: 'LOCAL_REFERENCE_RESOLUTION_NOT_IMPLEMENTED' }, [intake.stage], createdAt);
  }

  const structural = validateEvidenceDisposition(intake.record, intake.correlation_id);
  if (!structural.ok) return terminal(intake, structural, [intake.stage, structural.stage], createdAt);

  const semantic = validateSemantics(intake.record, intake.correlation_id);
  if (!semantic.ok) return terminal(intake, semantic, [intake.stage, structural.stage, semantic.stage], createdAt);

  const policy = evaluatePolicy(request.policy, intake.correlation_id);
  if (!policy.ok) return terminal(intake, policy, [intake.stage, structural.stage, semantic.stage, policy.stage], createdAt);

  return Object.freeze({
    ok: true,
    status: 'verified',
    correlation_id: intake.correlation_id,
    receipt: createReceipt({
      correlationId: intake.correlation_id,
      inputBinding: intake.input_binding,
      schemaVersion: EVIDENCE_DISPOSITION_SCHEMA_VERSION,
      result: 'verified',
      stages: [intake.stage, structural.stage, semantic.stage, policy.stage, 'KRN-REC-001'],
      createdAt,
    }),
  });
}
