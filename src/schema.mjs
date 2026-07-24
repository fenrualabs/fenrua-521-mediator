import {
  AUTHORITY_STATUSES,
  DISCLOSURE_CLASSES,
  DISPOSITIONS,
  EVIDENCE_DISPOSITION_SCHEMA_DIGEST,
  EVIDENCE_DISPOSITION_SCHEMA_VERSION,
} from './constants.mjs';
import { canonicalRecord, fail, isPlainObject, sha256Binding } from './common.mjs';

const STAGE = 'KRN-SCH-001';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const FACT_ID = /^F-[A-Za-z0-9_-]{1,80}$/;
const REQUIRED_ROOT = [
  'record_version', 'record_id', 'created_at', 'actor', 'claim_scope', 'disposition', 'authority_status',
  'facts', 'inferences', 'evidence_refs', 'missing_evidence', 'conflicts', 'risks',
  'permitted_next_steps', 'prohibited_actions', 'integrity',
];

function exactKeys(value, required) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function stringWithin(value, min, max) {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

function validDateTime(value) {
  return stringWithin(value, 20, 64) && !Number.isNaN(Date.parse(value));
}

function validStringArray(value, maxItemLength) {
  return Array.isArray(value) && value.every((entry) => stringWithin(entry, 1, maxItemLength));
}

function validOptionalTextArray(value, maxItemLength) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length <= maxItemLength);
}

function validFact(fact) {
  return exactKeys(fact, ['fact_id', 'statement', 'evidence_ref', 'source_digest', 'verification', 'disclosure_class'])
    && FACT_ID.test(fact.fact_id)
    && stringWithin(fact.statement, 1, 4000)
    && stringWithin(fact.evidence_ref, 1, 240)
    && DIGEST.test(fact.source_digest)
    && ['direct', 'kernel_verified', 'human_attested'].includes(fact.verification)
    && DISCLOSURE_CLASSES.has(fact.disclosure_class);
}

function validInference(inference) {
  return exactKeys(inference, ['statement', 'depends_on', 'assumptions', 'confidence', 'counterexamples_considered'])
    && stringWithin(inference.statement, 1, 4000)
    && Array.isArray(inference.depends_on)
    && inference.depends_on.length >= 1
    && inference.depends_on.every((value) => stringWithin(value, 1, 240) && FACT_ID.test(value))
    && validOptionalTextArray(inference.assumptions, 1000)
    && ['bounded', 'low', 'not_applicable'].includes(inference.confidence)
    && validOptionalTextArray(inference.counterexamples_considered, 1000);
}

function validEvidenceReference(reference) {
  return exactKeys(reference, ['id', 'digest', 'classification'])
    && stringWithin(reference.id, 1, 240)
    && DIGEST.test(reference.digest)
    && DISCLOSURE_CLASSES.has(reference.classification);
}

function validSourceBinding(binding) {
  return exactKeys(binding, ['source_id', 'source_digest', 'classification'])
    && stringWithin(binding.source_id, 1, 240)
    && DIGEST.test(binding.source_digest)
    && DISCLOSURE_CLASSES.has(binding.classification);
}

function validIntegrity(integrity) {
  return exactKeys(integrity, ['schema_digest', 'parent_record_refs', 'source_bindings'])
    && DIGEST.test(integrity.schema_digest)
    && Array.isArray(integrity.parent_record_refs)
    && integrity.parent_record_refs.every((value) => typeof value === 'string' && value.length <= 240)
    && Array.isArray(integrity.source_bindings)
    && integrity.source_bindings.every(validSourceBinding);
}

/** Validates the pinned evidence-disposition structure and returns canonical bytes. */
export function validateEvidenceDisposition(record, correlationId) {
  if (!exactKeys(record, REQUIRED_ROOT)) return fail(STAGE, 'INVALID_RECORD_SHAPE', 'REJECT', correlationId);
  const valid = record.record_version === EVIDENCE_DISPOSITION_SCHEMA_VERSION
    && stringWithin(record.record_id, 1, 160)
    && validDateTime(record.created_at)
    && exactKeys(record.actor, ['type', 'identifier'])
    && ['human', 'model', 'kernel_tool'].includes(record.actor.type)
    && stringWithin(record.actor.identifier, 1, 160)
    && stringWithin(record.claim_scope, 1, 4000)
    && DISPOSITIONS.has(record.disposition)
    && AUTHORITY_STATUSES.has(record.authority_status)
    && Array.isArray(record.facts) && record.facts.every(validFact)
    && Array.isArray(record.inferences) && record.inferences.every(validInference)
    && Array.isArray(record.evidence_refs) && record.evidence_refs.every(validEvidenceReference)
    && validStringArray(record.missing_evidence, 1000)
    && validStringArray(record.conflicts, 1000)
    && validStringArray(record.risks, 1000)
    && validStringArray(record.permitted_next_steps, 1000)
    && validStringArray(record.prohibited_actions, 1000)
    && validIntegrity(record.integrity);
  if (!valid) return fail(STAGE, 'SCHEMA_VALIDATION_FAILED', 'REJECT', correlationId);
  if (record.integrity.schema_digest !== EVIDENCE_DISPOSITION_SCHEMA_DIGEST) {
    return fail(STAGE, 'SCHEMA_DIGEST_MISMATCH', 'REJECT', correlationId);
  }
  try {
    return Object.freeze({
      ok: true,
      stage: STAGE,
      status: 'structural-valid',
      canonical: canonicalRecord(record),
      record_binding: sha256Binding(record),
    });
  } catch {
    return fail(STAGE, 'CANONICAL_SERIALIZATION_FAILED', 'REJECT', correlationId);
  }
}
