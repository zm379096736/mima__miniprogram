const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveActualLineup,
  applyActualLineupToPreview
} = require('../utils/actualLineup');

const players = Array.from({ length: 12 }, (_, index) => ({
  id: `p${index + 1}`,
  name: `Player ${index + 1}`,
  score: 70 + index,
  points: 0
}));

test('resolveActualLineup accepts ten unique cards regardless of signup state', () => {
  const lineup = resolveActualLineup(
    players,
    ['p1', 'p2', 'p3', 'p4', 'p11'],
    ['p6', 'p7', 'p8', 'p9', 'p12']
  );

  assert.deepEqual(lineup.participantIds, ['p1', 'p2', 'p3', 'p4', 'p11', 'p6', 'p7', 'p8', 'p9', 'p12']);
  assert.equal(lineup.radiant[4].name, 'Player 11');
  assert.equal(lineup.dire[4].name, 'Player 12');
});

test('resolveActualLineup rejects incomplete duplicate or missing cards', () => {
  assert.throws(
    () => resolveActualLineup(players, ['p1'], ['p6', 'p7', 'p8', 'p9', 'p10']),
    /每队必须选择 5 位实际参赛选手/
  );
  assert.throws(
    () => resolveActualLineup(players, ['p1', 'p2', 'p3', 'p4', 'p5'], ['p5', 'p7', 'p8', 'p9', 'p10']),
    /实际参赛阵容不能包含重复选手/
  );
  assert.throws(
    () => resolveActualLineup(players, ['p1', 'p2', 'p3', 'p4', 'missing'], ['p6', 'p7', 'p8', 'p9', 'p10']),
    /没有找到实际参赛选手/
  );
});

test('applyActualLineupToPreview overrides automatic Steam matching and preserves KDA', () => {
  const preview = {
    matchId: '8899',
    radiantWin: true,
    radiant: Array.from({ length: 5 }, (_, index) => ({
      accountId: index + 1,
      playerId: `wrong-r${index}`,
      name: 'Wrong',
      kills: index,
      deaths: 1,
      assists: 2
    })),
    dire: Array.from({ length: 5 }, (_, index) => ({
      accountId: index + 6,
      playerId: `wrong-d${index}`,
      name: 'Wrong',
      kills: index + 5,
      deaths: 2,
      assists: 3
    }))
  };

  const reconciled = applyActualLineupToPreview(
    preview,
    ['p1', 'p2', 'p3', 'p4', 'p5'],
    ['p6', 'p7', 'p8', 'p9', 'p10'],
    players
  );

  assert.equal(reconciled.matchedCount, 10);
  assert.equal(reconciled.radiant[0].playerId, 'p1');
  assert.equal(reconciled.radiant[0].name, 'Player 1');
  assert.equal(reconciled.radiant[0].kills, 0);
  assert.equal(reconciled.dire[4].playerId, 'p10');
  assert.equal(reconciled.dire[4].kills, 9);
});
