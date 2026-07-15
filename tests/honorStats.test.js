const test = require('node:test');
const assert = require('node:assert/strict');

const { applyFinalHonorAwards } = require('../utils/honorStats');

test('applyFinalHonorAwards increments each daily winner once', () => {
  const players = [
    { id: 'p1', mvp: 2, touch: 0 },
    { id: 'p2', mvp: 1, touch: 0 }
  ];

  assert.deepEqual(applyFinalHonorAwards(players, {
    mvp: { playerId: 'p2', votes: 3 },
    touch: { playerId: 'p1', votes: 2 }
  }), [
    { id: 'p1', mvp: 2, touch: 1 },
    { id: 'p2', mvp: 2, touch: 0 }
  ]);
});

test('applyFinalHonorAwards does nothing before a winner exists', () => {
  const players = [{ id: 'p1', mvp: 0, touch: 0 }];

  assert.deepEqual(applyFinalHonorAwards(players, { mvp: null, touch: null }), players);
});
