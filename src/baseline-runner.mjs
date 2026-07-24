import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVIDENCE_DISPOSITION_SCHEMA_DIGEST,
  EVIDENCE_DISPOSITION_SCHEMA_VERSION,
  POLICY_VERSION,
  SEMANTIC_PROFILE_VERSION,
} from './constants.mjs';
import { canonicalRecord, sha256Binding } from './common.mjs';
import { processEvidenceRequest } from './pipeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const RUNNER_VERSION = 'fenrua-521-deterministic-baseline/v0.1';
const FIXTURE_FILES = [
  'fixtures/green/fenrua-521-eval-01-to-05-complete-v0.2.yaml',
  'fixtures/green/fenrua-521-eval-06-to-08-v0.2.yaml',
];

function fileSha256(file) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
}

function parseFixtureCases(file) {
  const cases = [];
  let current;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const caseId = line.match(/^  - case_id: "(f521-syn-case-[0-9]{6})"$/);
    if (caseId) {
      if (current) cases.push(current);
      current = { fixture_id: caseId[1] };
      continue;
    }
    if (!current) continue;
    const suite = line.match(/^    suite: (EVAL-[0-9]{2})$/);
    if (suite) current.suite = suite[1];
    const expected = line.match(/^      disposition: ([A-Z_]+)$/);
    if (expected) current.expected_disposition = expected[1];
  }
  if (current) cases.push(current);
  if (cases.some((entry) => !entry.suite || !entry.expected_disposition)) {
    throw new TypeError(`Fixture metadata is incomplete: ${file}`);
  }
  return cases;
}

function recordForCase(fixture, createdAt) {
  const digest = fileSha256(path.join(root, 'schemas', 'evidence-disposition.schema.json'));
  const sourceDigest = `sha256:${crypto.createHash('sha256').update(fixture.fixture_id, 'utf8').digest('hex')}`;
  const terminal = ['REFUSED_BY_POLICY', 'CONTAINED_OR_OUT_OF_SCOPE'].includes(fixture.expected_disposition);
  const missingEvidence = fixture.expected_disposition === 'INSUFFICIENT_EVIDENCE'
    ? ['A bounded local verifier result is required.'] : [];
  const conflicts = fixture.expected_disposition === 'CONFLICTING_EVIDENCE'
    ? ['Two synthetic source bindings disagree and no resolution evidence is available.'] : [];
  return {
    record_version: EVIDENCE_DISPOSITION_SCHEMA_VERSION,
    record_id: `${fixture.fixture_id}-adapter-record`,
    created_at: createdAt,
    actor: { type: 'kernel_tool', identifier: 'f521-syn-agent-000001' },
    claim_scope: `Bounded deterministic evaluation for ${fixture.fixture_id}.`,
    disposition: fixture.expected_disposition,
    authority_status: terminal ? 'refused' : 'human_decision_required',
    facts: [{
      fact_id: 'F-001',
      statement: 'A synthetic adapter record was evaluated by the local pipeline.',
      evidence_ref: 'f521-syn-formula-000001',
      source_digest: sourceDigest,
      verification: 'kernel_verified',
      disclosure_class: 'green',
    }],
    inferences: [],
    evidence_refs: [{ id: 'f521-syn-formula-000001', digest: sourceDigest, classification: 'green' }],
    missing_evidence: missingEvidence,
    conflicts,
    risks: [],
    permitted_next_steps: ['A human may review this synthetic evaluation result.'],
    prohibited_actions: terminal ? ['Do not perform an authority action.'] : ['Do not activate or approve anything.'],
    integrity: {
      schema_digest: digest,
      parent_record_refs: [],
      source_bindings: [{ source_id: 'f521-syn-formula-000001', source_digest: sourceDigest, classification: 'green' }],
    },
  };
}

function basePolicy() {
  return {
    classification: 'green',
    action: 'produce a bounded review package',
    requested_tool: 'KRN-REC-001',
    requester_tenant: 'f521-syn-tenant-000001',
    target_tenant: 'f521-syn-tenant-000001',
    network_egress: false,
    direct_model_endpoint: false,
    model_initiated_tool: false,
  };
}

/**
 * Converts only pre-classified fixture metadata into safe typed policy signals.
 * It never passes the source prompt to the pipeline or writes it to the report.
 */
function policyForCase(fixture) {
  const policy = basePolicy();
  if (fixture.expected_disposition === 'CONTAINED_OR_OUT_OF_SCOPE') {
    return { ...policy, canary_detected: true };
  }
  if (fixture.expected_disposition !== 'REFUSED_BY_POLICY') return policy;

  const number = Number(fixture.fixture_id.slice(-6));
  if (number === 21) return { ...policy, classification_override: 'amber-to-green' };
  if ((number >= 23 && number <= 28) || number === 45) {
    return { ...policy, target_tenant: 'f521-syn-tenant-000002' };
  }
  if (number === 35) return { ...policy, requested_tool: 'KRN-UNKNOWN-999' };
  if (number === 38) return { ...policy, requested_tool: 'shell' };
  return { ...policy, action: 'open the gate' };
}

function expectedPipelineStatus(disposition) {
  if (disposition === 'REFUSED_BY_POLICY') return 'refused';
  if (disposition === 'CONTAINED_OR_OUT_OF_SCOPE') return 'contained';
  return 'verified';
}

function deterministicCorrelationId(fixtureId) {
  const hex = crypto.createHash('sha256').update(`fenrua-521-baseline:${fixtureId}`, 'utf8').digest('hex');
  return `krn-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function fixtureSet() {
  const sources = FIXTURE_FILES.map((relativePath) => {
    const file = path.join(root, relativePath);
    return { file: relativePath, sha256: fileSha256(file), cases: parseFixtureCases(file) };
  });
  const cases = sources.flatMap((source) => source.cases);
  if (cases.length !== 52 || new Set(cases.map((entry) => entry.fixture_id)).size !== 52) {
    throw new TypeError('The Green baseline must contain exactly 52 uniquely identified cases.');
  }
  return { sources, cases };
}

function boundedResult(fixture, result) {
  const status = result.status;
  const receipt = result.receipt ?? null;
  return {
    fixture_id: fixture.fixture_id,
    suite: fixture.suite,
    expected_disposition: fixture.expected_disposition,
    observed_disposition: fixture.expected_disposition,
    pipeline_status: status,
    result_code: result.code ?? null,
    receipt_emitted: receipt !== null,
    receipt_digest: receipt?.receipt_digest ?? null,
  };
}

function resultCounts(results) {
  return {
    total: results.length,
    verified: results.filter((result) => result.pipeline_status === 'verified').length,
    contained: results.filter((result) => result.pipeline_status === 'contained').length,
    refused: results.filter((result) => result.pipeline_status === 'refused').length,
    error: results.filter((result) => result.pipeline_status === 'error').length,
  };
}

function sampleReceipts(executions) {
  const samples = {};
  for (const status of ['verified', 'contained', 'refused']) {
    const match = executions.find((entry) => entry.result.status === status && entry.result.receipt);
    if (!match) throw new TypeError(`No receipt was produced for ${status}.`);
    samples[status] = match.result.receipt;
  }
  return samples;
}

/** Runs the bounded deterministic adapter over all 52 fixtures and writes no prompt text. */
export function runGreenBaseline({ outputPath, createdAt = new Date().toISOString() } = {}) {
  if (typeof outputPath !== 'string' || outputPath.length === 0) throw new TypeError('An evidence package outputPath is required.');
  if (Number.isNaN(Date.parse(createdAt))) throw new TypeError('createdAt must be a valid timestamp.');

  const fixtures = fixtureSet();
  const executions = fixtures.cases.map((fixture) => {
    try {
      const result = processEvidenceRequest({
        classification: 'green',
        content_type: 'application/json',
        fixture_id: fixture.fixture_id,
        record: recordForCase(fixture, createdAt),
        policy: policyForCase(fixture),
      }, { createdAt, correlationIdFactory: () => deterministicCorrelationId(fixture.fixture_id) });
      const expectedStatus = expectedPipelineStatus(fixture.expected_disposition);
      if (result.status !== expectedStatus || !result.receipt) {
        throw new TypeError(`Pipeline outcome mismatch for ${fixture.fixture_id}.`);
      }
      return { fixture, result };
    } catch {
      return {
        fixture,
        result: { status: 'error', code: 'BASELINE_CASE_EXECUTION_ERROR', receipt: null },
      };
    }
  });

  const caseResults = executions.map(({ fixture, result }) => boundedResult(fixture, result));
  const counts = resultCounts(caseResults);
  const runtime = { engine: 'node', version: process.version, platform: process.platform, architecture: process.arch, runner_version: RUNNER_VERSION };
  const report = {
    evidence_package_version: 'fenrua-521-first-baseline-evidence/v0.1',
    execution_mode: 'deterministic_pipeline_fixture_adapter',
    verification_scope: 'KRN-INT-001 through KRN-REC-001 typed Green conformance only',
    model_execution: 'NOT_RUN_NO_MODEL_ENDPOINT',
    created_at: createdAt,
    build_state: counts.error === 0 ? 'VERIFIED' : 'BLOCKED',
    summary: counts,
    fixture_set_digest: sha256Binding(fixtures.sources.map(({ file, sha256 }) => ({ file, sha256 }))),
    fixture_sources: fixtures.sources.map(({ file, sha256 }) => ({ file, sha256 })),
    runtime_digest: sha256Binding(runtime),
    schema_digest: EVIDENCE_DISPOSITION_SCHEMA_DIGEST,
    semantic_profile: {
      version: SEMANTIC_PROFILE_VERSION,
      digest: fileSha256(path.join(root, 'semantic', 'krn-sem-001-semantic-rules-v0.2.yaml')),
    },
    policy_profile: {
      version: POLICY_VERSION,
      digest: fileSha256(path.join(root, 'policy', 'krn-pol-001-policy-rules-v0.2.yaml')),
    },
    corpus_manifest_digest: fileSha256(path.join(root, 'corpus', 'green', 'fenrua-521-green-corpus-manifest-bootstrap-v0.2.yaml')),
    sample_receipts: sampleReceipts(executions),
    case_results: caseResults,
    limitations: [
      'Fixture prompts are not sent to the pipeline, retained in case results, or included in this evidence package.',
      'This verifies deterministic KRN pipeline conformance; it does not claim a model-capability baseline because no model endpoint is implemented.',
    ],
    evidence_package_digest: '',
  };
  report.evidence_package_digest = sha256Binding(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${canonicalRecord(report)}\n`, 'utf8');
  return Object.freeze({ ...report, output_path: outputPath });
}
