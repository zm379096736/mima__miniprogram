const test = require('node:test');
const assert = require('node:assert/strict');

const { updatePlayerProfile, positionText, normalizeSteamIds } = require('../utils/playerProfile');

test('updatePlayerProfile lets a player save score and preferred positions', () => {
  const players = [
    { id: 'p1', name: 'Player One', score: 92, points: 6, preferredPositions: [1, 2], steamId: '' },
    { id: 'p2', name: 'Mid Player', score: 90, preferredPositions: [2], steamId: '' }
  ];

  const updated = updatePlayerProfile(players, 'p1', {
    score: '85',
    preferredPositions: ['1', '3', '5'],
    steamId: '76561198000000000, 12345',
    avatarUrl: 'cloud://avatar.png'
  });

  assert.deepEqual(updated[0], {
    id: 'p1',
    name: 'Player One',
    score: 85,
    points: 6,
    preferredPositions: [1, 3, 5],
    steamId: '76561198000000000, 12345',
    steamIds: ['76561198000000000', '12345'],
    avatarUrl: 'cloud://avatar.png',
    profileCompleted: true
  });
  assert.equal(updated[1].score, 90);
});

test('updatePlayerProfile rejects empty position preferences', () => {
  assert.throws(() => updatePlayerProfile([{ id: 'p1', score: 80, preferredPositions: [1] }], 'p1', {
    score: 80,
    preferredPositions: []
  }));
});

test('updatePlayerProfile rejects score outside 0 to 150', () => {
  assert.throws(() => updatePlayerProfile([{ id: 'p1', score: 80, preferredPositions: [1] }], 'p1', {
    score: 180,
    preferredPositions: [1]
  }));
});

test('positionText formats selected positions', () => {
  assert.equal(positionText([1, 3, 5]), '1\u53f7\u4f4d / 3\u53f7\u4f4d / 5\u53f7\u4f4d');
});

test('normalizeSteamIds supports multiple ids', () => {
  assert.deepEqual(normalizeSteamIds('1, 2\n1 3'), ['1', '2', '3']);
});
