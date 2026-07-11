const test = require('node:test');
const assert = require('node:assert/strict');

const { updatePlayerProfile, positionText } = require('../utils/playerProfile');

test('updatePlayerProfile lets a player save score and preferred positions', () => {
  const players = [
    { id: 'p1', name: 'Player One', score: 92, preferredPositions: [1, 2], steamId: '' },
    { id: 'p2', name: 'Mid Player', score: 90, preferredPositions: [2], steamId: '' }
  ];

  const updated = updatePlayerProfile(players, 'p1', {
    score: '85',
    preferredPositions: ['1', '3', '5'],
    steamId: '76561198000000000'
  });

  assert.deepEqual(updated[0], {
    id: 'p1',
    name: 'Player One',
    score: 85,
    preferredPositions: [1, 3, 5],
    steamId: '76561198000000000'
  });
  assert.equal(updated[1].score, 90);
});

test('updatePlayerProfile rejects empty position preferences', () => {
  assert.throws(() => updatePlayerProfile([{ id: 'p1', score: 80, preferredPositions: [1] }], 'p1', {
    score: 80,
    preferredPositions: []
  }), /至少选择一个偏好位置/);
});

test('updatePlayerProfile rejects score outside 0 to 150', () => {
  assert.throws(() => updatePlayerProfile([{ id: 'p1', score: 80, preferredPositions: [1] }], 'p1', {
    score: 180,
    preferredPositions: [1]
  }), /分数范围/);
});

test('positionText formats selected positions', () => {
  assert.equal(positionText([1, 3, 5]), '1号位 / 3号位 / 5号位');
});
