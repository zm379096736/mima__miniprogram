const test = require('node:test');
const assert = require('node:assert/strict');

const { removeMatchById } = require('../utils/matchHistory');

test('removeMatchById removes the selected match only', () => {
  const matches = [
    { id: 'm1', title: 'A' },
    { id: 'm2', title: 'B' },
    { id: 'm3', title: 'C' }
  ];

  assert.deepEqual(removeMatchById(matches, 'm2'), [
    { id: 'm1', title: 'A' },
    { id: 'm3', title: 'C' }
  ]);
});

test('removeMatchById rejects empty match id', () => {
  assert.throws(() => removeMatchById([], ''), /请选择要删除的战绩/);
});
