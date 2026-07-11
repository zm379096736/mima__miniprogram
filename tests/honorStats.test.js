const test = require('node:test');
const assert = require('node:assert/strict');

const { applyHonorStatVote } = require('../utils/honorStats');

test('applyHonorStatVote moves mvp stat when voter changes vote', () => {
  const players = [
    { id: 'p1', mvp: 2, touch: 0 },
    { id: 'p2', mvp: 1, touch: 0 }
  ];

  assert.deepEqual(applyHonorStatVote(players, 'mvp', 'p1', 'p2'), [
    { id: 'p1', mvp: 1, touch: 0 },
    { id: 'p2', mvp: 2, touch: 0 }
  ]);
});

test('applyHonorStatVote increments touch stat for first vote', () => {
  const players = [{ id: 'p1', mvp: 0 }];

  assert.deepEqual(applyHonorStatVote(players, 'touch', '', 'p1'), [{ id: 'p1', mvp: 0, touch: 1 }]);
});
