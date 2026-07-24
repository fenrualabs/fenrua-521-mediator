import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { sha256Binding } from '../src/common.mjs';
import { INTER_ENGINE_ENVELOPE_SCHEMA_DIGEST } from '../src/constants.mjs';
import { ENVELOPE_PROFILE_DIGEST, ENVELOPE_SCHEMA_DIGEST, validateInterEngineEnvelope } from '../src/inter-engine-envelope.mjs';
import { runInterEngineEnvelopeExamples } from '../src/inter-engine-envelope-runner.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'envelope', 'fenrua-521-inter-engine-envelope-rules-v0.4.yaml');
const fixturePath = path.join(root, 'envelope', 'fenrua-521-inter-engine-envelope-examples-v0.4.json');
const schemaPath = path.join(root, 'schemas', 'inter-engine-envelope.schema.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const sha256 = (file) => `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

test('binds the supplied envelope examples to the existing inter-engine schema', () => {
  assert.equal(sha256(schemaPath), ENVELOPE_SCHEMA_DIGEST);
  assert.equal(INTER_ENGINE_ENVELOPE_SCHEMA_DIGEST, ENVELOPE_SCHEMA_DIGEST);
  assert.equal(fixture.schema_digest, ENVELOPE_SCHEMA_DIGEST);
  assert.equal(sha256(profilePath), ENVELOPE_PROFILE_DIGEST);
  assert.equal(fixture.example_set_digest, sha256Binding(fixture.examples));
  const profile = fs.readFileSync(profilePath, 'utf8');
  assert.match(profile, /both input_binding and integrity.request_binding/);
  assert.match(profile, /exact engine_id plus candidate_digest approval pair/);
});

test('returns the six expected acceptance and rejection codes with digest-bound receipts', () => {
  const outcomes = fixture.examples.map((example) => ({ example, result: validateInterEngineEnvelope(example.envelope, fixture.validation_config) }));
  assert.deepEqual(outcomes.map(({ result }) => [result.outcome, result.code]), [
    ['ACCEPT', 'ENVELOPE_ACCEPTED'],
    ['REJECT', 'ENVELOPE_MISSING_CORRELATION_ID'],
    ['REJECT', 'ENVELOPE_VERSION_UNSUPPORTED'],
    ['REJECT', 'ENVELOPE_BINDING_KIND_MISMATCH'],
    ['REJECT', 'ENVELOPE_EXPIRED'],
    ['REJECT', 'ENVELOPE_TASK_CLASS_FORBIDDEN'],
  ]);
  for (const { result } of outcomes) {
    assert.equal(result.receipt.receipt_digest, sha256Binding({ ...result.receipt, receipt_digest: '' }));
    assert.equal('scope' in result.receipt, false);
    assert.equal('input_binding' in result.receipt, false);
  }
});

test('requires exact local sender, recipient, and binding approvals rather than syntax alone', () => {
  const valid = structuredClone(fixture.examples[0].envelope);
  assert.equal(validateInterEngineEnvelope(valid, { ...fixture.validation_config, approved_senders: [] }).code, 'ENVELOPE_SENDER_UNAPPROVED');
  assert.equal(validateInterEngineEnvelope(valid, { ...fixture.validation_config, recipient_id: 'different-mediator' }).code, 'ENVELOPE_RECIPIENT_MISMATCH');
  assert.equal(validateInterEngineEnvelope(valid, { ...fixture.validation_config, approved_green_bindings: [] }).code, 'ENVELOPE_BINDING_UNAPPROVED');
  const amber = structuredClone(valid);
  amber.classification = 'amber_local';
  amber.input_binding = { kind: 'keyed_local_commitment', value: 'hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
  amber.integrity.request_binding = { kind: 'keyed_local_commitment', value: 'hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
  assert.deepEqual([validateInterEngineEnvelope(amber, fixture.validation_config).outcome, validateInterEngineEnvelope(amber, fixture.validation_config).code], ['ACCEPT', 'ENVELOPE_ACCEPTED']);
});

test('fails closed when validator configuration is incomplete', () => {
  const result = validateInterEngineEnvelope(fixture.examples[0].envelope, { recipient_id: 'mediator-primary' });
  assert.deepEqual([result.outcome, result.code], ['REJECT', 'ENVELOPE_VALIDATOR_UNCONFIGURED']);
});

test('records verified envelope evidence without persisting task scopes or binding values', () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-envelope-'));
  const outputPath = path.join(directory, 'evidence.json');
  const report = runInterEngineEnvelopeExamples({ outputPath });
  assert.deepEqual(report.summary, { total: 6, accepted: 1, rejected: 5, error: 0 });
  assert.equal(report.build_state, 'VERIFIED');
  const serialized = fs.readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(serialized, /EVAL-01 evidence discipline|approved_green_sha256|hmac-sha256/);
  const evidence = JSON.parse(serialized);
  assert.equal(evidence.evidence_package_digest, sha256Binding({ ...evidence, evidence_package_digest: '' }));
  assert.equal(evidence.outcomes.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.receipt_digest)), true);
});

test('records the actual schema-hash correction and binds the six-case evidence in the manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'module-manifest.json'), 'utf8'));
  const bound = manifest.inter_engine_envelope_validation;
  const evidencePath = path.join(root, 'evidence', 'envelopes', 'fenrua-521-inter-engine-envelope-examples-v0.3.json');
  assert.equal(manifest.schema_assets.inter_engine_envelope.sha256, ENVELOPE_SCHEMA_DIGEST);
  assert.equal(bound.schema.sha256, ENVELOPE_SCHEMA_DIGEST);
  assert.match(bound.schema.correction, /actual imported schema bytes verify/);
  assert.equal(sha256(profilePath), bound.profile.profile_sha256);
  assert.equal(sha256(fixturePath), bound.examples.sha256);
  assert.equal(sha256(path.join(root, 'src', 'inter-engine-envelope.mjs')), bound.implementation.validator_sha256);
  assert.equal(sha256(path.join(root, 'src', 'inter-engine-envelope-runner.mjs')), bound.implementation.runner_sha256);
  assert.equal(sha256(path.join(root, 'bin', 'run-inter-engine-envelope-examples.mjs')), bound.implementation.entrypoint_sha256);
  assert.equal(sha256(evidencePath), bound.execution.sha256);
  assert.deepEqual(bound.execution.summary, { total: 6, accepted: 1, rejected: 5, error: 0 });
});
