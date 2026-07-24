import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { sha256Binding } from '../src/common.mjs';
import { buildPreferenceDataPackage, PREFERENCE_DATA_PACKAGE_ID, PREFERENCE_OBJECTIVE_ID, runPreferenceObjective, verifyPreferenceDataPackage } from '../src/preference-objective.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

test('builds a digest-bound preference source index without duplicating protected inputs', () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-preference-package-'));
  const outputPath = path.join(directory, 'package.json');
  const report = buildPreferenceDataPackage({ outputPath });
  assert.equal(report.package_id, PREFERENCE_DATA_PACKAGE_ID);
  assert.equal(report.declared_coverage.reviewed_green_behavioural_cards, 12);
  assert.equal(report.declared_coverage.frozen_green_fixture_cases, 52);
  assert.equal(report.declared_coverage.synthetic_formula_test_vectors, 10);
  const stored = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.package_digest, sha256Binding({ ...stored, package_digest: '' }));
  assert.equal(verifyPreferenceDataPackage({ packagePath: outputPath }).package_digest, report.package_digest);
  const serialized = fs.readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(serialized, /CANARY-|FENRUA_COLIBRI_API_KEY|claimed_commitment|f521-syn-case-/);
});

test('records the currently blocked capability baseline as NEEDS_EVIDENCE rather than a candidate pass', () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-preference-evidence-'));
  const packagePath = path.join(directory, 'package.json');
  buildPreferenceDataPackage({ outputPath: packagePath });
  const outputPath = path.join(directory, 'evidence.json');
  const report = runPreferenceObjective({ outputPath, dataPackagePath: packagePath, createdAt: '2026-07-25T04:05:06.000Z' });
  assert.equal(report.objective.id, PREFERENCE_OBJECTIVE_ID);
  assert.equal(report.build_state, 'NEEDS_EVIDENCE');
  assert.equal(report.candidate_success, false);
  assert.deepEqual(report.model_coverage, { engine_eligible_cases: 23, valid_bounded_model_responses: 0, complete: false, candidate_status: 'NEEDS_EVIDENCE' });
  assert.equal(report.dimensions['PREF-02'].status, 'MEDIATOR_VERIFIED_CANDIDATE_UNTESTED');
  assert.equal(report.dimensions['PREF-04'].status, 'MEDIATOR_VERIFIED_CANDIDATE_UNTESTED');
  assert.equal(report.dimensions['PREF-08'].status, 'MEDIATOR_VERIFIED_CANDIDATE_UNTESTED');
  const stored = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(stored.evidence_package_digest, sha256Binding({ ...stored, evidence_package_digest: '' }));
  assert.doesNotMatch(JSON.stringify(stored), /CANARY-|FENRUA_COLIBRI_API_KEY|claimed_commitment|f521-syn-case-/);
});

test('pins the profile and preflight evidence in the module manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'module-manifest.json'), 'utf8'));
  const bound = manifest.specialist_preference_objective;
  const packagePath = path.join(root, 'preference', 'f521-pref-001-data-package-v0.1.json');
  const evidencePath = path.join(root, 'evidence', 'preference', 'f521-pref-001-preflight-v0.1.json');
  assert.equal(bound.objective.id, PREFERENCE_OBJECTIVE_ID);
  assert.equal(sha256(path.join(root, bound.objective.file)), bound.objective.sha256);
  assert.equal(sha256(path.join(root, bound.data_package.file)), bound.data_package.sha256);
  assert.equal(sha256(path.join(root, bound.implementation.file)), bound.implementation.sha256);
  assert.equal(sha256(path.join(root, bound.implementation.package_entrypoint)), bound.implementation.package_entrypoint_sha256);
  assert.equal(sha256(path.join(root, bound.implementation.evaluation_entrypoint)), bound.implementation.evaluation_entrypoint_sha256);
  assert.equal(sha256(packagePath), bound.data_package.sha256);
  assert.equal(sha256(evidencePath), bound.execution.sha256);
  assert.equal(bound.execution.build_state, 'NEEDS_EVIDENCE');
});
