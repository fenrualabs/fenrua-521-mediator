import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createReceipt } from '../index.mjs';
import { EVIDENCE_DISPOSITION_SCHEMA_VERSION } from '../src/constants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const receiptPath = path.join(here, '..', 'receipt', 'krn-rec-001-receipt-v0.2.yaml');
const inputBinding = { kind: 'approved_green_sha256', value: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
const common = {
  correlationId: 'krn-123e4567-e89b-12d3-a456-426614174000',
  inputBinding,
  schemaVersion: EVIDENCE_DISPOSITION_SCHEMA_VERSION,
  createdAt: '2026-07-25T01:02:03.000Z',
};

test('pins the bounded KRN-REC-001 receipt contract', () => {
  const source = fs.readFileSync(receiptPath, 'utf8');
  assert.match(source, /^receipt_version: "fenrua-521-receipt\/v1"$/m);
  for (const stage of ['KRN-INT-001', 'KRN-SCH-001', 'KRN-SEM-001', 'KRN-POL-001']) {
    assert.match(source, new RegExp(`^  - ${stage}$`, 'm'));
  }
  assert.match(source, /^  - result: verified \| contained \| refused$/m);
});

test('KRN-REC-001 creates bounded, digest-covered receipts only from approved bindings', () => {
  const receipt = createReceipt({
    ...common,
    result: 'verified',
    stages: ['KRN-INT-001', 'KRN-SCH-001', 'KRN-SEM-001', 'KRN-POL-001', 'KRN-REC-001'],
  });
  assert.match(receipt.receipt_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(receipt.immutable_reference, receipt.receipt_digest);
  assert.equal('canonical' in receipt, false);

  assert.throws(() => createReceipt({ ...common, inputBinding: { kind: 'unavailable', value: 'not-recorded' }, result: 'contained', stages: ['KRN-INT-001', 'KRN-REC-001'] }));
  assert.throws(() => createReceipt({ ...common, result: 'verified', stages: ['KRN-INT-001', 'KRN-REC-001'] }));
  assert.throws(() => createReceipt({ ...common, createdAt: 'not-a-timestamp', result: 'contained', stages: ['KRN-INT-001', 'KRN-REC-001'] }));
});
