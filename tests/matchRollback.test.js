const test = require('node:test');
const assert = require('node:assert/strict');

const { rollbackMatchStats } = require('../utils/matchRollback');

test('rollbackMatchStats reverses manual match player changes', () => {
  const players = [
    { id: 'r1', matches: 3, wins: 2, mvp: 1, pressure: 0, score: 84 },
    { id: 'r2', matches: 3, wins: 2, mvp: 0, pressure: 0, score: 82 },
    { id: 'd1', matches: 3, wins: 1, mvp: 0, pressure: 1, score: 77 }
  ];
  const match = {
    scoringVersion: 2,
    participantIds: ['r1', 'r2', 'd1'],
    winnerIds: ['r1', 'r2'],
    mvpId: 'r1',
    pressureId: 'd1'
  };

  assert.deepEqual(rollbackMatchStats(players, match), [
    { id: 'r1', matches: 2, wins: 1, mvp: 0, pressure: 0, score: 82 },
    { id: 'r2', matches: 2, wins: 1, mvp: 0, pressure: 0, score: 80 },
    { id: 'd1', matches: 2, wins: 1, mvp: 0, pressure: 0, score: 78 }
  ]);
});

test('rollbackMatchStats reverses imported match player changes', () => {
  const players = [
    { id: 'p1', matches: 1, wins: 1, score: 82 },
    { id: 'p2', matches: 1, wins: 0, score: 79 }
  ];
  const match = {
    scoringVersion: 2,
    imported: true,
    radiantWin: true,
    radiant: [{ playerId: 'p1' }],
    dire: [{ playerId: 'p2' }]
  };

  assert.deepEqual(rollbackMatchStats(players, match), [
    { id: 'p1', matches: 0, wins: 0, score: 80 },
    { id: 'p2', matches: 0, wins: 0, score: 80 }
  ]);
});
