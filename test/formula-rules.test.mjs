import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const formulaPath = path.join(root, 'formula', 'krn-fml-001-core-interface-v0.3.yaml');
const planPath = path.join(root, 'formula', 'krn-fml-001-promotion-plan-v0.1.yaml');
const profilePath = path.join(root, 'formula', 'reference', 'f521-event-reference-v0.1.yaml');
const vectorPath = path.join(root, 'formula', 'reference', 'f521-event-reference-v0.1-vectors.json');
const evidencePath = path.join(root, 'evidence', 'formula', 'f521-event-reference-v0.1.json');
const moduleManifestPath = path.join(root, 'module-manifest.json');

function fileDigest(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

test('pins KRN-FML-001 as an evidence-gated core Formula Contract boundary', () => {
  const source = fs.readFileSync(formulaPath, 'utf8');
  const formulaIds = [...source.matchAll(/^  - (F521-[A-Z0-9]+-[0-9]{3})$/gm)].map((match) => match[1]);
  assert.deepEqual(formulaIds, [
    'F521-KEY-001', 'F521-ID-001', 'F521-EVENT-001', 'F521-P521-001', 'F521-NN-001',
    'F521-INGRESS-001', 'F521-LEDGER-001', 'F521-EPOCH-001', 'F521-INCLUSION-001',
  ]);
  assert.match(source, /^interface_version: "fenrua-521-fml-001\/v0\.3"$/m);
  assert.match(source, /REFERENCE_VERIFIED/);
  assert.match(source, /reference, independent-verifier, and approval evidence digests/);
});

test('requires recorded evidence before any production Formula Contract lock', () => {
  const plan = fs.readFileSync(planPath, 'utf8');
  const profile = fs.readFileSync(profilePath, 'utf8');
  assert.match(plan, /permitted_result: REFERENCE_VERIFIED/);
  assert.match(plan, /permitted_result: VERIFIED/);
  assert.match(plan, /The lock is based on the recorded evidence/);
  assert.match(profile, /F521-REFERENCE-EVENT-V1/);
  assert.match(profile, /reference_success_does_not_mean/);
});

test('binds the recorded reference evidence while keeping production unbound', () => {
  const manifest = JSON.parse(fs.readFileSync(moduleManifestPath, 'utf8'));
  assert.equal(manifest.formula_interface.id, 'KRN-FML-001');
  assert.equal(manifest.formula_interface.classification, 'amber_local_only');
  assert.equal(manifest.formula_interface.contract_binding_status, 'PRODUCTION_CONTRACT_UNBOUND_REFERENCE_AVAILABLE');
  assert.equal(manifest.formula_interface.reference_profile.evidence_status, 'REFERENCE_EVIDENCE_RECORDED_NOT_PRODUCTION_LOCKED');
  assert.equal(manifest.formula_interface.reference_profile.evidence.evidence_package_digest, 'sha256:962c6fda9da4b1c91c2f7cdb2dde1ec256dba5df22d9a848885d6f5ad69a1712');
  assert.deepEqual(manifest.formula_interface.reference_profile.evidence.summary, { total: 4, reference_verified: 1, rejected: 3, error: 0 });
  assert.equal(manifest.formula_interface.reference_profile.evidence.production_lock, 'NOT_REQUESTED');
  assert.equal(fileDigest(profilePath), manifest.formula_interface.reference_profile.profile_sha256);
  assert.equal(fileDigest(vectorPath), manifest.formula_interface.reference_profile.vector_set_sha256);
  assert.equal(fileDigest(evidencePath), manifest.formula_interface.reference_profile.evidence.sha256);
  assert.equal(JSON.parse(fs.readFileSync(evidencePath, 'utf8')).evidence_package_digest, manifest.formula_interface.reference_profile.evidence.evidence_package_digest);
  assert.equal(manifest.runtime_boundary.formula_contract_resolution, 'local Amber reference or evidence-complete production Formula Contract only');
});
