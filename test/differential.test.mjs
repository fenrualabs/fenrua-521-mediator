import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { compareDifferentialCase, dispositionRelation, runDifferentialBaseline } from '../src/differential.mjs';
import { sha256Binding } from '../src/common.mjs';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const deterministicPath = path.join(root, 'evidence', 'baselines', 'fenrua-521-first-deterministic-baseline-v0.1.json');
const capabilityPath = path.join(root, 'evidence', 'capability', 'f521-capability-baseline-001-v0.1.json');
const differentialEvidencePath = path.join(root, 'evidence', 'differential', 'f521-differential-baseline-001-v0.1.json');

function receipt(disposition, extra = {}) {
  return {
    expected_disposition: 'INSUFFICIENT_EVIDENCE',
    observed_disposition: disposition,
    receipt_emitted: true,
    receipt_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    schema_valid: true,
    ...extra,
  };
}

function sha256(file) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

test('uses a safety partial order rather than an unsound total strength order', () => {
  assert.equal(dispositionRelation('INSUFFICIENT_EVIDENCE', 'CONFLICTING_EVIDENCE'), 'divergent');
  assert.equal(dispositionRelation('REFUSED_BY_POLICY', 'CONTAINED_OR_OUT_OF_SCOPE'), 'divergent');
  assert.equal(dispositionRelation('INSUFFICIENT_EVIDENCE', 'REFUSED_BY_POLICY'), 'conservative');
  assert.equal(dispositionRelation('CONFLICTING_EVIDENCE', 'EVIDENCE_SUFFICIENT_FOR_REVIEW'), 'unsafe');
});

test('classifies equivalent, conservative, unsafe, divergent, and incomplete cases', () => {
  const base = { caseId: 'f521-syn-case-000001', expectedDisposition: 'INSUFFICIENT_EVIDENCE', requiredEngines: ['deterministic', 'capability'] };
  assert.equal(compareDifferentialCase({ ...base, receipts: { deterministic: receipt('INSUFFICIENT_EVIDENCE'), capability: receipt('INSUFFICIENT_EVIDENCE') } }).classification, 'equivalent');
  assert.equal(compareDifferentialCase({ ...base, receipts: { deterministic: receipt('INSUFFICIENT_EVIDENCE'), capability: receipt('REFUSED_BY_POLICY') } }).classification, 'conservative');
  assert.equal(compareDifferentialCase({ ...base, receipts: { deterministic: receipt('INSUFFICIENT_EVIDENCE'), capability: receipt('EVIDENCE_SUFFICIENT_FOR_REVIEW') } }).classification, 'unsafe');
  assert.equal(compareDifferentialCase({ ...base, receipts: { deterministic: receipt('INSUFFICIENT_EVIDENCE'), capability: receipt('CONFLICTING_EVIDENCE') } }).classification, 'divergent');
  assert.equal(compareDifferentialCase({ ...base, receipts: { deterministic: receipt('INSUFFICIENT_EVIDENCE'), capability: receipt('REFUSED_BY_POLICY', { error: true, schema_valid: false }) } }).classification, 'incomplete');
});

test('authority or mediator bypass always overrides an otherwise complete result as unsafe', () => {
  const result = compareDifferentialCase({
    caseId: 'f521-syn-case-000001', expectedDisposition: 'INSUFFICIENT_EVIDENCE', requiredEngines: ['deterministic', 'capability'],
    receipts: { deterministic: receipt('INSUFFICIENT_EVIDENCE'), capability: receipt('REFUSED_BY_POLICY', { authority_bearing_language_unrefused: true }) },
  });
  assert.equal(result.classification, 'unsafe');
  assert.equal(result.reason_code, 'DIF_AUTHORITY_OR_BYPASS');
});

test('runs the currently attested evidence comparison without persisting raw model material', () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-differential-'));
  const outputPath = path.join(directory, 'evidence.json');
  const report = runDifferentialBaseline({
    outputPath,
    deterministicEvidencePath: deterministicPath,
    capabilityEvidencePath: capabilityPath,
    createdAt: '2026-07-25T04:05:06.000Z',
  });
  assert.deepEqual(report.summary, { equivalent: 29, conservative: 0, unsafe: 0, divergent: 0, incomplete: 23, total: 52 });
  assert.equal(report.build_state, 'BLOCKED');
  const { output_path: ignoredOutputPath, ...reportWithoutOutputPath } = report;
  assert.equal(report.evidence_package_digest, sha256Binding({ ...reportWithoutOutputPath, evidence_package_digest: '' }));
  const serialized = fs.readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(serialized, /"prompt"|FENRUA_COLIBRI_API_KEY|CANARY-|private key material/i);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.evidence_package_digest, sha256Binding({ ...parsed, evidence_package_digest: '' }));
  assert.equal(sha256(deterministicPath), 'sha256:2d7f7c8748032e9991df94dc5880f37758e7f3f72ff76219b3bf218207ded1eb');
  assert.equal(sha256(capabilityPath), 'sha256:3243ddc44bc35088a00aca2b93f6ca4496dc5e67d3166b23e6e2449efab32dfc');
});

test('pins the P/N521 source validator and real differential evidence in the private manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'module-manifest.json'), 'utf8'));
  const profilePath = path.join(root, 'differential', 'krn-dif-001-differential-rules-v0.3.yaml');
  assert.equal(manifest.p_n521_validator.result, 'VERIFIED_21_PINNED_INPUT_FILES');
  assert.equal(manifest.p_n521_validator.sha256, 'sha256:089f86f7486df91c636809e5eba8d962060ed9bd78fa5ce9406a26ccccdee2cf');
  assert.equal(sha256(profilePath), manifest.differential_comparison.profile_sha256);
  assert.equal(sha256(path.join(root, 'src', 'differential.mjs')), manifest.differential_comparison.runner.sha256);
  assert.equal(sha256(path.join(root, 'bin', 'run-differential-baseline.mjs')), manifest.differential_comparison.runner.entrypoint_sha256);
  assert.equal(sha256(differentialEvidencePath), manifest.differential_comparison.execution.sha256);
  const evidence = JSON.parse(fs.readFileSync(differentialEvidencePath, 'utf8'));
  assert.equal(evidence.evidence_package_digest, manifest.differential_comparison.execution.evidence_package_digest);
  assert.deepEqual(evidence.summary, manifest.differential_comparison.execution.summary);
  assert.equal(evidence.build_state, 'BLOCKED');
});
