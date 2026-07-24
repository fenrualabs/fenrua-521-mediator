import { SEMANTIC_PROFILE_VERSION } from './constants.mjs';
import { containsSuspectOrCanary, fail, isPlainObject } from './common.mjs';

const STAGE = 'KRN-SEM-001';
const FACT_ID = /^F-[A-Za-z0-9_-]{1,80}$/;

function ruleFailure(code, action, correlationId) {
  return fail(STAGE, code, action, correlationId);
}

/**
 * Applies the KRN-SEM-001 v0.2 profile to a record that has already passed
 * KRN-SCH-001. No rule repairs input or returns raw content.
 */
export function validateSemantics(record, correlationId) {
  if (!isPlainObject(record)) return ruleFailure('SEMANTIC_INPUT_NOT_OBJECT', 'REJECT', correlationId);

  // SEM-001 / SEM-002
  const factIds = record.facts.map((fact) => fact.fact_id);
  if (new Set(factIds).size !== factIds.length) return ruleFailure('DUPLICATE_FACT_ID', 'REJECT', correlationId);
  if (!record.facts.every((fact) => FACT_ID.test(fact.fact_id))) {
    return ruleFailure('INVALID_FACT_ID_FORMAT', 'REJECT', correlationId);
  }

  // SEM-003 / SEM-004
  const knownFacts = new Set(factIds);
  if (!record.inferences.every((inference) => inference.depends_on.every((id) => knownFacts.has(id)))) {
    return ruleFailure('DANGLING_INFERENCE_DEPENDENCY', 'REJECT', correlationId);
  }
  const factStatements = new Set(record.facts.map((fact) => fact.statement));
  if (record.inferences.some((inference) => factStatements.has(inference.statement))) {
    return ruleFailure('INFERENCE_PROMOTED_TO_FACT', 'REJECT', correlationId);
  }

  // SEM-005 through SEM-008
  if (record.disposition === 'EVIDENCE_SUFFICIENT_FOR_REVIEW'
      && (record.evidence_refs.length === 0
        || !record.facts.every((fact) => fact.evidence_ref && fact.source_digest)
        || record.missing_evidence.length !== 0)) {
    return ruleFailure('SUFFICIENT_WITHOUT_COMPLETE_EVIDENCE', 'REJECT', correlationId);
  }
  if (record.disposition === 'INSUFFICIENT_EVIDENCE' && record.missing_evidence.length === 0) {
    return ruleFailure('INSUFFICIENT_WITHOUT_MISSING_LIST', 'REJECT', correlationId);
  }
  if (record.disposition === 'CONFLICTING_EVIDENCE' && record.conflicts.length === 0) {
    return ruleFailure('CONFLICTING_WITHOUT_CONFLICT_LIST', 'REJECT', correlationId);
  }
  if (record.disposition === 'REFUSED_BY_POLICY' && record.prohibited_actions.length === 0) {
    return ruleFailure('REFUSED_WITHOUT_PROHIBITED_ACTION', 'REJECT', correlationId);
  }

  // SEM-009: locally frozen cross-reference convention.
  for (const fact of record.facts) {
    const evidence = record.evidence_refs.filter((reference) => reference.id === fact.evidence_ref);
    const source = record.integrity.source_bindings.filter((binding) => binding.source_digest === fact.source_digest);
    if (evidence.length !== 1 || source.length !== 1
      || evidence[0].classification !== fact.disclosure_class
      || source[0].classification !== fact.disclosure_class) {
      return ruleFailure('SOURCE_CLASSIFICATION_MISMATCH', 'REJECT', correlationId);
    }
  }

  // SEM-010
  if (record.facts.some((fact) => fact.disclosure_class === 'red')
    || record.evidence_refs.some((reference) => reference.classification === 'red')
    || record.integrity.source_bindings.some((binding) => binding.classification === 'red')) {
    return ruleFailure('RED_DATA_IN_MODEL_PATH', 'CONTAIN', correlationId);
  }

  // SEM-011
  if (['REFUSED_BY_POLICY', 'CONTAINED_OR_OUT_OF_SCOPE'].includes(record.disposition)
    && !['no_authority_requested', 'refused'].includes(record.authority_status)) {
    return ruleFailure('AUTHORITY_STATUS_INCONSISTENT', 'REJECT', correlationId);
  }

  // SEM-012
  const overLimit = record.facts.length > 64
    || record.inferences.length > 32
    || record.missing_evidence.length > 32
    || record.conflicts.length > 16
    || record.risks.length > 16
    || record.permitted_next_steps.length > 16
    || record.prohibited_actions.length > 16;
  if (overLimit) return ruleFailure('RECORD_SIZE_LIMIT_EXCEEDED', 'REJECT', correlationId);

  // SEM-013
  if (containsSuspectOrCanary(record)) return ruleFailure('RAW_OR_CANARY_CONTENT_DETECTED', 'CONTAIN', correlationId);

  return Object.freeze({ ok: true, stage: STAGE, status: 'semantic-valid', semantic_profile_version: SEMANTIC_PROFILE_VERSION });
}
