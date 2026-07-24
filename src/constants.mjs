export const MODULE_VERSION = 'fenrua-521-mediator/v1';
export const SEMANTIC_PROFILE_VERSION = 'fenrua-521-sem-001/v0.2';
export const POLICY_VERSION = 'fenrua-521-pol-001/v0.2';
export const RECEIPT_VERSION = 'fenrua-521-receipt/v1';
export const EVIDENCE_DISPOSITION_SCHEMA_VERSION = 'fenrua-521-disposition/v1';
export const EVIDENCE_DISPOSITION_SCHEMA_DIGEST =
  'sha256:3612ea9ee7f440d7d2458acc343b777f28871195481e6ec09e252251caed48a0';
export const INTER_ENGINE_ENVELOPE_SCHEMA_DIGEST =
  'sha256:3a1e270a1cf2ecf444b5cfafd92eeab0866ea6eb9ba62fa78edd4fc4736a06059292';

export const DISPOSITIONS = new Set([
  'EVIDENCE_SUFFICIENT_FOR_REVIEW',
  'INSUFFICIENT_EVIDENCE',
  'CONTAINED_OR_OUT_OF_SCOPE',
  'CONFLICTING_EVIDENCE',
  'REFUSED_BY_POLICY',
]);

export const AUTHORITY_STATUSES = new Set(['human_decision_required', 'no_authority_requested', 'refused']);
export const DISCLOSURE_CLASSES = new Set(['green', 'amber', 'red']);
