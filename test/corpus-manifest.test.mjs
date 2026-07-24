import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const manifestPath = path.join(root, 'corpus', 'green', 'fenrua-521-green-corpus-manifest-bootstrap-v0.2.yaml');
const moduleManifestPath = path.join(root, 'module-manifest.json');
const semanticPath = path.join(root, 'semantic', 'krn-sem-001-semantic-rules-v0.2.yaml');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function normalizedManifestDigest(source) {
  const normalized = source.replace(/^(  manifest_digest: ).*$/m, '$1""');
  return `sha256:${crypto.createHash('sha256').update(normalized, 'utf8').digest('hex')}`;
}

test('pins all seven Green corpus items including the owner-supplied acceptance spec', () => {
  const source = fs.readFileSync(manifestPath, 'utf8');
  const itemSection = source.slice(source.indexOf('items:'), source.indexOf('local_verification_bindings:'));
  const itemIds = [...itemSection.matchAll(/^  - item_id: "(G-[0-9]{4})"$/gm)].map((match) => match[1]);
  assert.deepEqual(itemIds, ['G-0001', 'G-0002', 'G-0003', 'G-0004', 'G-0005', 'G-0006', 'G-0007']);
  assert.match(source, /^classification: green$/m);
  assert.match(source, /^contains_live_data: false$/m);
  assert.match(source, /^  bound_items: 7$/m);
  assert.match(source, /^  pending_source_items: 0$/m);
  assert.match(source, /^  rejected_items: 0$/m);
  assert.match(source, /^  amber_or_red_items: 0$/m);
  assert.match(source, /^    binding_state: bound$/m);
  assert.match(source, /^publication: "private repository only; classification does not authorize public publication"$/m);
  assert.match(source, /^  local_implementation_rule: "Implementation files may verify a corpus item but are not Green corpus entries\."$/m);
  assert.match(source, /^  manifest_digest: "sha256:[a-f0-9]{64}"$/m);
  assert.equal(source.match(/^  manifest_digest: "(sha256:[a-f0-9]{64})"$/m)?.[1], normalizedManifestDigest(source));
});

test('content-addresses every bound corpus artifact and keeps implementation code local-only', () => {
  const source = fs.readFileSync(manifestPath, 'utf8');
  const boundArtifacts = [
    ['semantic/krn-sem-001-semantic-rules-v0.2.yaml', 'c750da8b005e7fd7d2e2e2f7790fde966fb8219a311bd1cae3790d1fa91c1723'],
    ['policy/krn-pol-001-policy-rules-v0.2.yaml', 'e15ab1c3973ff69938025d746f28ec5ebb93a3d0e17047b05dc12e4e1a7f138f'],
    ['intake/krn-int-001-intake-v0.2.yaml', '1ba1bfe7af8a440da553f16ac28aad54929a09179ab19c9dbd9faf33d39aff39'],
    ['receipt/krn-rec-001-receipt-v0.2.yaml', 'e3afcce93b9681e864efcaad591f0e411e3caed5b56d50119ad4337679e782f4'],
    ['fixtures/green/fenrua-521-eval-01-to-05-complete-v0.2.yaml', 'ff2801f4113e499d10d2b557abdfd1cbb908479b190d2a2689b5dd00649fc06a'],
    ['fixtures/green/fenrua-521-eval-06-to-08-v0.2.yaml', '02eb5cac03fc55849fb21b4a3714f3d82cfc30bc0435097bb954c3967f69e96d'],
    ['fixtures/green/fenrua-521-green-behavioural-cards-v0.2.yaml', 'b7d4ee53af85385d73491f1263d03dcc6b3a4ea351b5d35827cf340f68a2f32e'],
    ['corpus/green/fenrua-521-first-baseline-acceptance-spec-v0.2.yaml', 'c6e202888606bd9b695779f7a43d626cf8a6e49eef137ecf0d98e0e5cae16274'],
  ];
  for (const [relativePath, expectedHash] of boundArtifacts) {
    assert.equal(sha256(path.join(root, relativePath)), expectedHash, relativePath);
    assert.ok(source.includes(`path: "${relativePath}"`), relativePath);
    assert.ok(source.includes(`sha256: "sha256:${expectedHash}"`), relativePath);
  }
  const itemSection = source.slice(source.indexOf('items:'), source.indexOf('local_verification_bindings:'));
  assert.doesNotMatch(itemSection, /path: "src\/semantic\.mjs"/);
  assert.match(source, /^    implementation_path: "src\/semantic\.mjs"$/m);
  assert.match(source, /^    disclosure: local_only$/m);
  assert.equal(sha256(path.join(root, 'src', 'semantic.mjs')), '4d971d98270c81f02157f3e8991fff65c56cd2f34c2686b1cacd9e6b15a268ab');
});

test('pins the thirteen SEM rules from the Green source artifact', () => {
  const source = fs.readFileSync(semanticPath, 'utf8');
  const ruleIds = [...source.matchAll(/^  - id: (SEM-[0-9]{3})$/gm)].map((match) => match[1]);
  assert.deepEqual(ruleIds, Array.from({ length: 13 }, (_, index) => `SEM-${String(index + 1).padStart(3, '0')}`));
  assert.match(source, /^rule_set_version: "fenrua-521-sem-001\/v0\.2"$/m);
  assert.match(source, /^fail_closed: true$/m);
  assert.match(source, /^    code: "SOURCE_CLASSIFICATION_MISMATCH"$/m);
});

test('pins the owner-provided minimum requirements for the first evidence package', () => {
  const acceptancePath = path.join(root, 'corpus', 'green', 'fenrua-521-first-baseline-acceptance-spec-v0.2.yaml');
  const source = fs.readFileSync(acceptancePath, 'utf8');
  const ids = [...source.matchAll(/^  - id: (BAS-[0-9]{3})$/gm)].map((match) => match[1]);
  assert.deepEqual(ids, ['BAS-001', 'BAS-002', 'BAS-003', 'BAS-004', 'BAS-005']);
  assert.match(source, /^# Status: ACCEPTED — owner-provided local execution requirements$/m);
  assert.match(source, /^  model_capability_not_claimed:/m);
  assert.match(source, /^  raw_prompt_handling:/m);
});

test('binds the corpus control manifest and semantic source in the private module manifest', () => {
  const moduleManifest = JSON.parse(fs.readFileSync(moduleManifestPath, 'utf8'));
  assert.equal(moduleManifest.semantic_profile.file, 'semantic/krn-sem-001-semantic-rules-v0.2.yaml');
  assert.equal(moduleManifest.semantic_profile.profile_sha256, 'sha256:c750da8b005e7fd7d2e2e2f7790fde966fb8219a311bd1cae3790d1fa91c1723');
  assert.equal(moduleManifest.corpus_manifest.file, 'corpus/green/fenrua-521-green-corpus-manifest-bootstrap-v0.2.yaml');
  assert.equal(moduleManifest.corpus_manifest.manifest_sha256, `sha256:${sha256(manifestPath)}`);
  assert.deepEqual(moduleManifest.corpus_manifest.pending_source_items, []);
  assert.equal(moduleManifest.corpus_manifest.publication, 'private repository only');
  assert.equal(moduleManifest.status, 'VERIFIED');
  assert.equal(moduleManifest.baseline_evaluation_set.execution_status, 'VERIFIED_DETERMINISTIC_PIPELINE_CONFORMANCE');
  assert.deepEqual(moduleManifest.baseline_evaluation_set.evidence_package.summary, { total: 52, verified: 23, contained: 3, refused: 26, error: 0 });
  assert.equal(moduleManifest.baseline_evaluation_set.runner.sha256, `sha256:${sha256(path.join(root, 'src', 'baseline-runner.mjs'))}`);
  assert.equal(moduleManifest.baseline_evaluation_set.evidence_package.sha256, `sha256:${sha256(path.join(root, 'evidence', 'baselines', 'fenrua-521-first-deterministic-baseline-v0.1.json'))}`);
});
