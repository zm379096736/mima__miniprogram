const test = require('node:test');
const assert = require('node:assert/strict');

const { rollbackMatchStats } = require('../utils/matchRollback');

test('rollbackMatchStats reverses manual match player changes', () => {
  const players = [
    { id: 'r1', matches: 3, wins: 2, mvp: 1, pressure: 0, score: 86, points: 2 },
    { id: 'r2', matches: 3, wins: 2, mvp: 0, pressure: 0, score: 80, points: 2 },
    { id: 'd1', matches: 3, wins: 1, mvp: 0, pressure: 1, score: 78, points: -1 }
  ];
  const match = {
    scoringVersion: 3,
    participantIds: ['r1', 'r2', 'd1'],
    winnerIds: ['r1', 'r2'],
    mvpId: 'r1',
    pressureId: 'd1'
  };

  assert.deepEqual(rollbackMatchStats(players, match), [
    { id: 'r1', matches: 2, wins: 1, mvp: 0, pressure: 0, score: 86, points: 0 },
    { id: 'r2', matches: 2, wins: 1, mvp: 0, pressure: 0, score: 80, points: 0 },
    { id: 'd1', matches: 2, wins: 1, mvp: 0, pressure: 0, score: 78, points: 0 }
  ]);
});

test('rollbackMatchStats reverses imported match player changes', () => {
  const players = [
    { id: 'p1', matches: 1, wins: 1, score: 82, points: 2 },
    { id: 'p2', matches: 1, wins: 0, score: 79, points: -1 }
  ];
  const match = {
    scoringVersion: 3,
    imported: true,
    radiantWin: true,
    radiant: [{ playerId: 'p1' }],
    dire: [{ playerId: 'p2' }]
  };

  assert.deepEqual(rollbackMatchStats(players, match), [
    { id: 'p1', matches: 0, wins: 0, score: 82, points: 0 },
    { id: 'p2', matches: 0, wins: 0, score: 79, points: 0 }
  ]);
});
