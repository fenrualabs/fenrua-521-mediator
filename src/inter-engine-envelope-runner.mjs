import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalRecord, sha256Binding } from './common.mjs';
import { ENVELOPE_PROFILE_DIGEST, validateInterEngineEnvelope } from './inter-engine-envelope.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'envelope', 'fenrua-521-inter-engine-envelope-examples-v0.4.json');

export function runInterEngineEnvelopeExamples({ outputPath, createdAt = '2026-07-25T00:00:00.000Z', examplesFile = fixturePath } = {}) {
  if (typeof outputPath !== 'string' || outputPath.length === 0) throw new TypeError('An evidence outputPath is required.');
  if (Number.isNaN(Date.parse(createdAt))) throw new TypeError('createdAt must be a valid timestamp.');
  const fixture = JSON.parse(fs.readFileSync(examplesFile, 'utf8'));
  if (!Array.isArray(fixture.examples) || fixture.examples.length !== 6 || !fixture.validation_config || fixture.example_set_digest !== sha256Binding(fixture.examples)) throw new TypeError('The bound inter-engine envelope profile must contain six digest-bound examples and validation configuration.');
  const outcomes = fixture.examples.map((example) => {
    const result = validateInterEngineEnvelope(example.envelope, fixture.validation_config);
    return {
      example_id: example.example_id,
      expected_outcome: example.expected_mediator_result,
      expected_reason_code: example.reason_code ?? 'ENVELOPE_ACCEPTED',
      actual_outcome: result.outcome,
      actual_reason_code: result.code,
      receipt_digest: result.receipt_digest,
      passed: result.outcome === example.expected_mediator_result && result.code === (example.reason_code ?? 'ENVELOPE_ACCEPTED'),
      receipt: result.receipt,
    };
  });
  const summary = outcomes.reduce((counts, outcome) => {
    counts.total += 1;
    if (outcome.actual_outcome === 'ACCEPT') counts.accepted += 1;
    if (outcome.actual_outcome === 'REJECT') counts.rejected += 1;
    if (!outcome.passed) counts.error += 1;
    return counts;
  }, { total: 0, accepted: 0, rejected: 0, error: 0 });
  const report = {
    evidence_version: 'fenrua-521-inter-engine-envelope-evidence/v0.3',
    classification: 'green',
    build_state: summary.error === 0 ? 'VERIFIED' : 'NEEDS_EVIDENCE',
    created_at: createdAt,
    profile: {
      envelope_version: fixture.envelope_version,
      schema_digest: fixture.schema_digest,
      profile_digest: ENVELOPE_PROFILE_DIGEST,
      example_set_digest: fixture.example_set_digest,
    },
    summary,
    outcomes,
    limitations: [
      'This verifies the local typed envelope validator and its configured approval bindings.',
      'It does not attest a live model response, model capability, or production authority.',
      'Envelope task scopes and binding values are excluded from the evidence package; only their digest-bound validation receipts are recorded.',
    ],
    evidence_package_digest: '',
  };
  report.evidence_package_digest = sha256Binding(report);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${canonicalRecord(report)}\n`, 'utf8');
  return Object.freeze({ ...report, output_path: outputPath });
}
