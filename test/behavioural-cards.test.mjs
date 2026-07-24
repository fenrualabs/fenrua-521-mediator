import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cardsPath = path.join(here, '..', 'fixtures', 'green', 'fenrua-521-green-behavioural-cards-v0.2.yaml');

test('pins the first twelve individually reviewed Green behavioural cards', () => {
  const source = fs.readFileSync(cardsPath, 'utf8');
  const cardIds = [...source.matchAll(/^\s+- card_id: "(G-BC-[0-9]{4})"$/gm)].map((match) => match[1]);
  assert.equal(cardIds.length, 12);
  assert.equal(new Set(cardIds).size, 12);
  assert.deepEqual(cardIds, Array.from({ length: 12 }, (_, index) => `G-BC-${String(index + 1).padStart(4, '0')}`));
  assert.match(source, /^card_set_version: "fenrua-521-behavioural-cards\/v0\.2"$/m);
  assert.match(source, /^total_cards: 12$/m);
  assert.match(source, /^classification: green$/m);
  assert.equal((source.match(/^    reconstruction_risk: low$/gm) ?? []).length, 12);
  for (const suite of ['EVAL-01', 'EVAL-02', 'EVAL-03', 'EVAL-04', 'EVAL-05', 'EVAL-07', 'EVAL-08']) {
    assert.match(source, new RegExp(`\\b${suite}\\b`));
  }
});
