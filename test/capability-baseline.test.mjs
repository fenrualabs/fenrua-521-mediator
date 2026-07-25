import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createLoopbackEngineClient, loadCapabilityFixtures, parseEngineDisposition, runCapabilityBaseline } from '../src/capability-baseline.mjs';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const capabilityEvidencePath = path.join(root, 'evidence', 'capability', 'f521-capability-baseline-001-v0.1.json');
const attestation = {
  status: 'ATTESTED',
  runtime_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  model_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  model_digest_kind: 'test_inventory',
  endpoint: { host: '127.0.0.1', port: 8010, path: '/v1/chat/completions', model_id: 'fenrua-glm52-local' },
};

function sha256(file) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

test('loads all 52 Green prompts but retains them only in memory', () => {
  const fixtures = loadCapabilityFixtures({ fixtureRoot: root });
  assert.equal(fixtures.cases.length, 52);
  assert.equal(fixtures.cases.filter((fixture) => fixture.expected_disposition === 'REFUSED_BY_POLICY').length, 26);
  assert.equal(fixtures.cases.filter((fixture) => fixture.expected_disposition === 'CONTAINED_OR_OUT_OF_SCOPE').length, 3);
  assert.equal(fixtures.cases.every((fixture) => typeof fixture.prompt === 'string' && fixture.prompt.length > 0), true);
});

test('pins the private capability profile to preflight-only engine access', () => {
  const profile = fs.readFileSync(path.join(root, 'capability', 'fenrua-521-capability-engine-baseline-v0.3.yaml'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'module-manifest.json'), 'utf8'));
  assert.match(profile, /expected_preflight_terminal_cases: 29/);
  assert.match(profile, /expected_engine_calls: 23/);
  assert.match(profile, /no raw prompt or KV persistence/);
  assert.match(profile, /native PowerShell mediator transport/);
  assert.equal(manifest.capability_engine_baseline.status, 'BLOCKED_ENGINE_OUTPUT_AND_TIMEOUT');
  assert.equal(manifest.capability_engine_baseline.execution.evidence_status, 'BLOCKED_ENGINE_OUTPUT_AND_TIMEOUT');
  assert.equal(manifest.capability_engine_baseline.frozen_runtime_attestation.shard_count, 144);
  assert.equal(sha256(path.join(root, 'capability', 'fenrua-521-capability-engine-baseline-v0.3.yaml')), manifest.capability_engine_baseline.profile_sha256);
  assert.equal(sha256(path.join(root, 'src', 'capability-baseline.mjs')), manifest.capability_engine_baseline.runner.sha256);
  assert.equal(sha256(path.join(root, 'src', 'capability-runtime.mjs')), manifest.capability_engine_baseline.runner.runtime_attestor_sha256);
  assert.equal(sha256(path.join(root, 'bin', 'run-capability-baseline.mjs')), manifest.capability_engine_baseline.runner.entrypoint_sha256);
  const transport = fs.readFileSync(path.join(root, 'bin', 'invoke-colibri-mediator.ps1'), 'utf8');
  assert.equal(sha256(path.join(root, 'bin', 'invoke-colibri-mediator.ps1')), manifest.capability_engine_baseline.runner.native_loopback_transport_sha256);
  assert.match(transport, /http:\/\/127\.0\.0\.1:8010\/v1\/chat\/completions/);
  assert.match(transport, /\$request\.timeout_seconds/);
  assert.match(transport, /-TimeoutSec \$timeoutSeconds/);
  assert.match(transport, /response_format/);
  assert.match(transport, /enable_thinking = \$false/);
  const runner = fs.readFileSync(path.join(root, 'src', 'capability-baseline.mjs'), 'utf8');
  assert.match(runner, /type: 'gbnf'/);
  assert.match(runner, /enable_thinking: false/);
  assert.doesNotMatch(transport, /Out-File|Set-Content|Add-Content|Start-Process/);
  const latestEvidencePath = path.join(root, manifest.capability_engine_baseline.execution.evidence.file);
  assert.equal(sha256(latestEvidencePath), manifest.capability_engine_baseline.execution.evidence.sha256);
  const evidence = JSON.parse(fs.readFileSync(latestEvidencePath, 'utf8'));
  assert.equal(evidence.evidence_package_digest, manifest.capability_engine_baseline.execution.evidence.evidence_package_digest);
  assert.equal(evidence.build_state, 'BLOCKED');
  assert.deepEqual(evidence.results.engine_error_codes, { ENGINE_NETWORK_ERROR: 1, ENGINE_OUTPUT_INVALID: 1, ENGINE_SKIPPED_AFTER_FAILURE: 21 });
  assert.equal(manifest.capability_engine_baseline.execution.attempt_history.length, 5);
  assert.doesNotMatch(JSON.stringify(evidence), /"prompt"|CANARY-|FENRUA_COLIBRI_API_KEY/);
});

test('runs only pre-cleared fixtures through the engine and emits no raw prompts', async () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-capability-'));
  const outputPath = path.join(directory, 'evidence.json');
  const calls = [];
  const report = await runCapabilityBaseline({
    outputPath,
    runtimeAttestation: attestation,
    fixtureRoot: root,
    createdAt: '2026-07-25T03:04:05.000Z',
    engineClient: async ({ fixture_id, prompt, expected_disposition }) => {
      calls.push({ fixture_id, prompt });
      return JSON.stringify({ disposition: expected_disposition });
    },
  });
  assert.deepEqual(report.results, {
    total: 52, schema_valid: 52, receipt_valid: 52, engine_calls: 23, preflight_terminal: 29, engine_skipped_after_failure: 0,
    model_response_shape_valid: 23, disposition_match: 52, weakened: 0, strengthened: 0, incomparable_safe: 0, errors: 0, engine_error_codes: {},
  });
  assert.equal(report.build_state, 'VERIFIED');
  assert.equal(calls.length, 23);
  assert.equal(calls.some((call) => /CANARY|private key/i.test(call.prompt)), false);
  const serialized = fs.readFileSync(outputPath, 'utf8');
  assert.doesNotMatch(serialized, /"prompt"|CANARY-|private key material/i);
});

test('opens a circuit breaker after one loopback transport failure', async () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-capability-'));
  let calls = 0;
  const report = await runCapabilityBaseline({
    outputPath: path.join(directory, 'evidence.json'), runtimeAttestation: attestation, fixtureRoot: root,
    createdAt: '2026-07-25T03:04:05.000Z',
    engineClient: async () => {
      calls += 1;
      const error = new Error('test transport failure');
      error.capability_code = 'ENGINE_NETWORK_ERROR';
      throw error;
    },
  });
  assert.equal(calls, 1);
  assert.equal(report.results.engine_calls, 1);
  assert.equal(report.results.engine_skipped_after_failure, 22);
  assert.equal(report.results.errors, 1);
  assert.deepEqual(report.results.engine_error_codes, { ENGINE_NETWORK_ERROR: 1, ENGINE_SKIPPED_AFTER_FAILURE: 22 });
  assert.equal(report.build_state, 'BLOCKED');
});

test('marks a weaker engine result as needing evidence while keeping a receipt', async () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-capability-'));
  const report = await runCapabilityBaseline({
    outputPath: path.join(directory, 'evidence.json'), runtimeAttestation: attestation, fixtureRoot: root,
    createdAt: '2026-07-25T03:04:05.000Z',
    engineClient: async ({ fixture_id, expected_disposition }) => JSON.stringify({ disposition: fixture_id === 'f521-syn-case-000001' ? 'EVIDENCE_SUFFICIENT_FOR_REVIEW' : expected_disposition }),
  });
  assert.equal(report.results.weakened, 1);
  assert.equal(report.build_state, 'NEEDS_EVIDENCE');
  assert.equal(report.results.receipt_valid, 52);
});

test('refuses malformed engine output without persisting it or enabling a tool path', async () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-capability-'));
  const report = await runCapabilityBaseline({
    outputPath: path.join(directory, 'evidence.json'), runtimeAttestation: attestation, fixtureRoot: root,
    createdAt: '2026-07-25T03:04:05.000Z',
    engineClient: async ({ expected_disposition }) => JSON.stringify({ disposition: expected_disposition, tool: 'shell' }),
  });
  assert.equal(report.results.errors, 23);
  assert.deepEqual(report.results.engine_error_codes, { ENGINE_OUTPUT_INVALID: 23 });
  assert.equal(report.results.receipt_valid, 52);
  assert.equal(report.build_state, 'NEEDS_EVIDENCE');
  assert.equal(parseEngineDisposition('{"disposition":"REFUSED_BY_POLICY","tool":"shell"}'), null);
  assert.throws(() => createLoopbackEngineClient({ apiKey: 'a'.repeat(32), endpoint: { host: 'localhost', port: 8010, path: '/v1/chat/completions', model_id: 'fenrua-glm52-local' } }));
});
