import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { intakeRequest } from '../index.mjs';
import { validRecord, validRequest } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const intakePath = path.join(here, '..', 'intake', 'krn-int-001-intake-v0.2.yaml');

test('pins the five KRN-INT-001 rules and local intake limits', () => {
  const source = fs.readFileSync(intakePath, 'utf8');
  const ids = [...source.matchAll(/^  - id: (INT-[0-9]{3})$/gm)].map((match) => match[1]);
  assert.deepEqual(ids, ['INT-001', 'INT-002', 'INT-003', 'INT-004', 'INT-005']);
  assert.match(source, /^rule_set_version: "fenrua-521-int-001\/v0\.2"$/m);
  assert.match(source, /^  max_bytes: 65536(?:\s+#.*)?$/m);
  assert.match(source, /^  max_fields: 128$/m);
  assert.match(source, /^  unicode_normalization: NFC$/m);
});

test('KRN-INT-001 enforces size, classification, suspect-content, and persistence boundaries', () => {
  const invalidContentType = intakeRequest({ ...validRequest(), content_type: 'text/plain' });
  assert.equal(invalidContentType.code, 'INTAKE_SIZE_OR_SHAPE');

  const nonGreen = intakeRequest({ ...validRequest(), classification: 'amber' });
  assert.equal(nonGreen.code, 'INTAKE_NON_GREEN');
  assert.equal(nonGreen.status, 'contained');

  const canary = intakeRequest(validRequest({ record: validRecord({ claim_scope: 'f521-canary local test marker' }) }));
  assert.equal(canary.code, 'INTAKE_CANARY_OR_SUSPECT');
  assert.equal(canary.status, 'contained');
  assert.equal('record' in canary, false);

  const persistence = intakeRequest({ ...validRequest(), persistence_requested: true });
  assert.equal(persistence.code, 'INTAKE_RAW_PERSISTENCE');
  assert.equal(persistence.status, 'contained');

  const fieldLimit = intakeRequest(validRequest(), { limits: { maxBytes: 65536, maxFields: 1 } });
  assert.equal(fieldLimit.code, 'INTAKE_SIZE_OR_SHAPE');
});

test('KRN-INT-001 issues opaque correlations only for accepted requests', () => {
  const accepted = intakeRequest(validRequest());
  assert.equal(accepted.ok, true);
  assert.match(accepted.correlation_id, /^krn-[0-9a-f-]{36}$/);
  assert.deepEqual(accepted.input_binding.kind, 'approved_green_sha256');
});
