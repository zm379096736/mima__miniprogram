const test = require('node:test');
const assert = require('node:assert/strict');

const { applyPigeonMarks } = require('../utils/pigeonStats');

test('applyPigeonMarks increments pigeon count for selected players only', () => {
  const players = [
    { id: 'p1', pigeon: 0 },
    { id: 'p2', pigeon: 2 },
    { id: 'p3', pigeon: 0 }
  ];

  assert.deepEqual(applyPigeonMarks(players, ['p1', 'p2']), [
    { id: 'p1', pigeon: 1 },
    { id: 'p2', pigeon: 3 },
    { id: 'p3', pigeon: 0 }
  ]);
});

test('applyPigeonMarks ignores duplicate selected ids', () => {
  const players = [{ id: 'p1', pigeon: 0 }];

  assert.deepEqual(applyPigeonMarks(players, ['p1', 'p1']), [{ id: 'p1', pigeon: 1 }]);
});
