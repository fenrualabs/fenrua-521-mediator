import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { sha256Binding } from '../src/common.mjs';
import { createFormulaTestProfileSession, TEST_PROFILE_DIGEST, TEST_PROFILE_FORMULA_IDS, TEST_PROFILE_VECTOR_SET_DIGEST, verifyFormulaTestProfile } from '../src/formula-test-profile.mjs';
import { runFormulaTestProfile } from '../src/formula-test-profile-runner.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'formula', 'test-profile', 'f521-fml-001-test-profile-contracts-v0.3.yaml');
const vectorPath = path.join(root, 'formula', 'test-profile', 'f521-fml-001-test-profile-v0.3-vectors.json');
const vectors = JSON.parse(fs.readFileSync(vectorPath, 'utf8'));
const sha256 = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

test('normalizes the supplied guidance into five explicit non-production test contracts', () => {
  assert.deepEqual(TEST_PROFILE_FORMULA_IDS, ['F521-TEST-EVENT-001', 'F521-TEST-NULL-001', 'F521-TEST-SIG-001', 'F521-TEST-MERKLE-001', 'F521-TEST-INCL-001']);
  const profile = fs.readFileSync(profilePath, 'utf8');
  assert.match(profile, /Successful execution emits REFERENCE_VERIFIED, never production VERIFIED/);
  assert.match(profile, /q is a canonical decimal uint64 string/);
  assert.match(profile, /side: left means the current node is left/);
  assert.equal(sha256(profilePath), TEST_PROFILE_DIGEST);
  assert.equal(sha256(vectorPath), TEST_PROFILE_VECTOR_SET_DIGEST);
});

test('runs all ten vectors with exact dispositions and self-verifying receipts', () => {
  const session = createFormulaTestProfileSession();
  const outcomes = vectors.cases.map((entry) => verifyFormulaTestProfile({ formula_id: entry.formula_id, version: vectors.version, public_inputs: entry.public_inputs }, { session }));
  assert.equal(outcomes.filter((entry) => entry.disposition === 'REFERENCE_VERIFIED').length, 5);
  assert.equal(outcomes.filter((entry) => entry.disposition === 'REJECTED').length, 5);
  outcomes.forEach((outcome, index) => {
    assert.equal(outcome.disposition, vectors.cases[index].expected_disposition, vectors.cases[index].vector_id);
    assert.equal(outcome.receipt.receipt_digest, sha256Binding({ ...outcome.receipt, receipt_digest: '' }));
    assert.equal('public_inputs' in outcome.receipt, false);
  });
});

test('requires the explicit synthetic session for the nullifier replay assertion', () => {
  const [first, second] = vectors.cases.filter((entry) => entry.formula_id === 'F521-TEST-NULL-001');
  const session = createFormulaTestProfileSession();
  assert.equal(verifyFormulaTestProfile({ formula_id: first.formula_id, version: vectors.version, public_inputs: first.public_inputs }, { session }).disposition, 'REFERENCE_VERIFIED');
  const replay = verifyFormulaTestProfile({ formula_id: second.formula_id, version: vectors.version, public_inputs: second.public_inputs }, { session });
  assert.deepEqual([replay.disposition, replay.reason_code], ['REJECTED', 'FML_TEST_NULL_REPLAY']);
});

test('rejects unknown test formulas, unbound versions, and malformed inputs', () => {
  const unknown = verifyFormulaTestProfile({ formula_id: 'F521-TEST-NOT-REAL', version: 'test-v1', public_inputs: {} });
  assert.deepEqual([unknown.disposition, unknown.reason_code], ['INSUFFICIENT_EVIDENCE', 'FML_TEST_UNKNOWN_FORMULA']);
  const wrongVersion = verifyFormulaTestProfile({ formula_id: 'F521-TEST-EVENT-001', version: 'wrong-v1', public_inputs: {} });
  assert.deepEqual([wrongVersion.disposition, wrongVersion.reason_code], ['INSUFFICIENT_EVIDENCE', 'FML_TEST_VERSION_UNBOUND']);
  const malformed = verifyFormulaTestProfile({ formula_id: 'F521-TEST-MERKLE-001', version: 'test-v1', public_inputs: { leaves: [], claimed_root: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } });
  assert.deepEqual([malformed.disposition, malformed.reason_code], ['REJECTED', 'FML_TEST_MERKLE_MALFORMED']);
});

test('records bounded local evidence without copying vector inputs', () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-formula-test-'));
  const outputPath = path.join(directory, 'evidence.json');
  const report = runFormulaTestProfile({ outputPath, createdAt: '2026-07-24T22:10:00.000Z' });
  assert.deepEqual(report.summary, { total: 10, reference_verified: 5, rejected: 5, error: 0 });
  assert.equal(report.build_state, 'REFERENCE_EVIDENCE_RECORDED');
  assert.equal(report.production_lock, 'NOT_REQUESTED');
  const serialized = fs.readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(serialized, /"public_inputs"|00000000000000000000000000000000000000000000000000000000000000aa/);
  const evidence = JSON.parse(serialized);
  assert.equal(evidence.evidence_package_digest, sha256Binding({ ...evidence, evidence_package_digest: '' }));
  assert.equal(evidence.outcomes.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.receipt_digest)), true);
});

test('pins the executed test profile and evidence without widening the core Formula registry', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'module-manifest.json'), 'utf8'));
  const bound = manifest.formula_interface.test_profile;
  const evidencePath = path.join(root, 'evidence', 'formula', 'f521-fml-001-test-profile-v0.3.json');
  assert.equal(bound.classification, 'amber_local_only');
  assert.equal(bound.evidence_status, 'REFERENCE_EVIDENCE_RECORDED_NOT_PRODUCTION_LOCKED');
  assert.equal(sha256(profilePath), bound.profile_sha256);
  assert.equal(sha256(vectorPath), bound.vector_set_sha256);
  assert.equal(sha256(path.join(root, 'src', 'formula-test-profile.mjs')), bound.implementation_sha256);
  assert.equal(sha256(path.join(root, 'src', 'formula-test-profile-runner.mjs')), bound.runner_sha256);
  assert.equal(sha256(path.join(root, 'bin', 'run-formula-test-profile.mjs')), bound.entrypoint_sha256);
  assert.equal(sha256(evidencePath), bound.evidence.sha256);
  assert.deepEqual(bound.evidence.summary, { total: 10, reference_verified: 5, rejected: 5, error: 0 });
  assert.equal(manifest.formula_interface.contract_binding_status, 'PRODUCTION_CONTRACT_UNBOUND_REFERENCE_AVAILABLE');
});
