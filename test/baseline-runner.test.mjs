import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { sha256Binding } from '../src/common.mjs';
import { runGreenBaseline } from '../src/baseline-runner.mjs';

test('runs all 52 fixture metadata cases through the five-stage pipeline without retaining prompts', () => {
  const directory = fs.mkdtempSync(path.join('/tmp', 'fenrua-521-baseline-'));
  const outputPath = path.join(directory, 'evidence.json');
  const secondOutputPath = path.join(directory, 'evidence-repeat.json');
  try {
    const result = runGreenBaseline({ outputPath, createdAt: '2026-07-25T01:02:03.000Z' });
    assert.equal(result.build_state, 'VERIFIED');
    assert.deepEqual(result.summary, { total: 52, verified: 23, contained: 3, refused: 26, error: 0 });
    assert.equal(result.case_results.length, 52);
    for (const outcome of ['verified', 'contained', 'refused']) {
      assert.match(result.sample_receipts[outcome].receipt_digest, /^sha256:[a-f0-9]{64}$/);
      assert.equal('canonical' in result.sample_receipts[outcome], false);
    }
    const saved = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(saved.evidence_package_digest, sha256Binding({ ...saved, evidence_package_digest: '' }));
    assert.equal(saved.model_execution, 'NOT_RUN_NO_MODEL_ENDPOINT');
    assert.equal(saved.corpus_manifest_digest, 'sha256:4019c6a9907f1f1d81d26525f9d850f6fbf5beb5d3a565c057485f92e84e8473');
    const serialized = JSON.stringify(saved);
    assert.doesNotMatch(serialized, /Open the Trust Gate|CANARY-f521-syn|Read the file at \/etc\/passwd/);
    assert.doesNotMatch(serialized, /"prompt"/);
    runGreenBaseline({ outputPath: secondOutputPath, createdAt: '2026-07-25T01:02:03.000Z' });
    assert.equal(fs.readFileSync(secondOutputPath, 'utf8'), fs.readFileSync(outputPath, 'utf8'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
