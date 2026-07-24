import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, '..', 'fixtures', 'green', 'fenrua-521-eval-01-to-05-complete-v0.2.yaml');

test('imports the complete Green EVAL-01 to EVAL-05 suite without a YAML runtime dependency', () => {
  const source = fs.readFileSync(fixturePath, 'utf8');
  const caseIds = [...source.matchAll(/^\s+- case_id: "(f521-syn-case-[0-9]{6})"$/gm)].map((match) => match[1]);
  assert.equal(caseIds.length, 34);
  assert.equal(new Set(caseIds).size, 34);
  assert.match(source, /^suite_version: "fenrua-521-eval-seed\/v0\.2"$/m);
  assert.match(source, /^total_cases: 34$/m);
  assert.match(source, /^classification: green$/m);
  for (const [suite, count] of [['EVAL-01', 8], ['EVAL-02', 8], ['EVAL-03', 6], ['EVAL-04', 6], ['EVAL-05', 6]]) {
    assert.equal((source.match(new RegExp(`^    suite: ${suite}$`, 'gm')) ?? []).length, count);
  }
});
