const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTemporaryPlayer,
  findClaimableTemporaryPlayer,
  assertSteamIdsAvailable
} = require('../utils/temporaryPlayer');

test('buildTemporaryPlayer creates a selectable zero-stat card', () => {
  const player = buildTemporaryPlayer({
    id: 'temp-1',
    name: 'Substitute',
    steamIds: ['12345']
  });

  assert.equal(player.id, 'temp-1');
  assert.equal(player.name, 'Substitute');
  assert.equal(player.score, 80);
  assert.equal(player.points, 0);
  assert.equal(player.matches, 0);
  assert.equal(player.wins, 0);
  assert.equal(player.temporary, true);
  assert.equal(player.profileCompleted, true);
  assert.deepEqual(player.preferredPositions, [1, 2, 3, 4, 5]);
  assert.deepEqual(player.steamIds, ['12345']);
});

test('findClaimableTemporaryPlayer selects an unclaimed matching Steam card', () => {
  const players = [
    { id: 'real', openid: 'wx1', temporary: false, steamIds: ['888'] },
    { id: 'temp', openid: '', temporary: true, steamIds: ['12345'], points: 4 }
  ];

  assert.equal(findClaimableTemporaryPlayer(players, ['12345']).id, 'temp');
  assert.equal(findClaimableTemporaryPlayer(players, ['999']), null);
});

test('assertSteamIdsAvailable rejects ownership by another permanent card', () => {
  const players = [
    { id: 'real', openid: 'wx1', temporary: false, steamIds: ['12345'] }
  ];

  assert.throws(
    () => assertSteamIdsAvailable(players, ['12345'], 'other'),
    /这个 Steam ID 已绑定其他选手卡/
  );
  assert.doesNotThrow(() => assertSteamIdsAvailable(players, ['12345'], 'real'));
});
