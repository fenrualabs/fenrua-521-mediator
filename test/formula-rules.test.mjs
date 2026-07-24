import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const formulaPath = path.join(root, 'formula', 'krn-fml-001-core-interface-v0.2.yaml');
const moduleManifestPath = path.join(root, 'module-manifest.json');

test('pins KRN-FML-001 as a core local Formula Contract boundary rather than a toy profile', () => {
  const source = fs.readFileSync(formulaPath, 'utf8');
  const formulaIds = [...source.matchAll(/^  - (F521-[A-Z0-9]+-[0-9]{3})$/gm)].map((match) => match[1]);
  assert.deepEqual(formulaIds, [
    'F521-KEY-001', 'F521-ID-001', 'F521-EVENT-001', 'F521-P521-001', 'F521-NN-001',
    'F521-INGRESS-001', 'F521-LEDGER-001', 'F521-EPOCH-001', 'F521-INCLUSION-001',
  ]);
  assert.match(source, /^tool_id: KRN-FML-001$/m);
  assert.match(source, /^interface_version: "fenrua-521-fml-001\/v0\.2"$/m);
  assert.match(source, /^classification: amber_local_only$/m);
  assert.match(source, /^  - No VERIFIED result may be created from prose, a generic mathematical profile, or a toy vector\.$/m);
  assert.doesNotMatch(source, /toy_modulus|TEST_EVENT|P-521 base field/);
});

test('records that no production Formula Contract is bound', () => {
  const manifest = JSON.parse(fs.readFileSync(moduleManifestPath, 'utf8'));
  assert.equal(manifest.formula_interface.id, 'KRN-FML-001');
  assert.equal(manifest.formula_interface.classification, 'amber_local_only');
  assert.equal(manifest.formula_interface.contract_binding_status, 'NO_APPROVED_FORMULA_CONTRACT_BOUND');
  assert.equal(manifest.runtime_boundary.formula_contract_resolution, 'local Amber Formula Contract only; no production profile is bound');
});
