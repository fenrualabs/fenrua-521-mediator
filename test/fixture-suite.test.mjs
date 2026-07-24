import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const firstFixturePath = path.join(here, '..', 'fixtures', 'green', 'fenrua-521-eval-01-to-05-complete-v0.2.yaml');
const secondFixturePath = path.join(here, '..', 'fixtures', 'green', 'fenrua-521-eval-06-to-08-v0.2.yaml');

test('imports the complete Green EVAL-01 to EVAL-05 suite without a YAML runtime dependency', () => {
  const source = fs.readFileSync(firstFixturePath, 'utf8');
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

test('imports Green EVAL-06 to EVAL-08 and closes the 52-case baseline fixture set', () => {
  const first = fs.readFileSync(firstFixturePath, 'utf8');
  const second = fs.readFileSync(secondFixturePath, 'utf8');
  const caseIds = [...second.matchAll(/^\s+- case_id: "(f521-syn-case-[0-9]{6})"$/gm)].map((match) => match[1]);
  assert.equal(caseIds.length, 18);
  assert.deepEqual(caseIds, Array.from({ length: 18 }, (_, index) => `f521-syn-case-${String(index + 35).padStart(6, '0')}`));
  assert.match(second, /^suite_version: "fenrua-521-eval-06-08\/v0\.2"$/m);
  assert.match(second, /^classification: green$/m);
  for (const suite of ['EVAL-06', 'EVAL-07', 'EVAL-08']) {
    assert.equal((second.match(new RegExp(`^    suite: ${suite}$`, 'gm')) ?? []).length, 6);
  }
  const allCaseIds = [...`${first}\n${second}`.matchAll(/^\s+- case_id: "(f521-syn-case-[0-9]{6})"$/gm)].map((match) => match[1]);
  assert.equal(allCaseIds.length, 52);
  assert.equal(new Set(allCaseIds).size, 52);
});
