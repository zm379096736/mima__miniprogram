const test = require('node:test');
const assert = require('node:assert/strict');

const { needsPigeonReset, resetPlayerPigeon } = require('../cloudfunctions/api/pigeonReset');

test('pigeon reset runs only before the target version', () => {
  assert.equal(needsPigeonReset({}, 1), true);
  assert.equal(needsPigeonReset({ pigeonResetVersion: 0 }, 1), true);
  assert.equal(needsPigeonReset({ pigeonResetVersion: 1 }, 1), false);
});

test('pigeon reset keeps all other player data', () => {
  const player = { id: 'p1', score: 88, wins: 3, mvp: 2, pigeon: 4 };

  assert.deepEqual(resetPlayerPigeon(player), {
    id: 'p1',
    score: 88,
    wins: 3,
    mvp: 2,
    pigeon: 0
  });
});
