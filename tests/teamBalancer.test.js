const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBalancedTeams, applyMatchResult, getBalanceReadiness } = require('../utils/teamBalancer');

const signups = [
  { id: 'p1', name: 'Carry A', score: 92, preferredPositions: [1, 2] },
  { id: 'p2', name: 'Mid A', score: 90, preferredPositions: [2] },
  { id: 'p3', name: 'Offlane A', score: 86, preferredPositions: [3] },
  { id: 'p4', name: 'Support A', score: 80, preferredPositions: [4] },
  { id: 'p5', name: 'Hard Support A', score: 76, preferredPositions: [5] },
  { id: 'p6', name: 'Carry B', score: 88, preferredPositions: [1] },
  { id: 'p7', name: 'Mid B', score: 83, preferredPositions: [2, 3] },
  { id: 'p8', name: 'Offlane B', score: 79, preferredPositions: [3] },
  { id: 'p9', name: 'Support B', score: 74, preferredPositions: [4] },
  { id: 'p10', name: 'Hard Support B', score: 70, preferredPositions: [5, 4] }
];

test('buildBalancedTeams gives each team positions 1 through 5 and keeps score gap small', () => {
  const result = buildBalancedTeams(signups);

  assert.equal(result.radiant.players.length, 5);
  assert.equal(result.dire.players.length, 5);
  assert.deepEqual(result.radiant.players.map((player) => player.assignedPosition).sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(result.dire.players.map((player) => player.assignedPosition).sort(), [1, 2, 3, 4, 5]);
  assert.ok(result.scoreGap <= 8, `expected score gap <= 8, got ${result.scoreGap}`);
});

test('buildBalancedTeams rejects rooms without exactly ten players', () => {
  assert.throws(() => buildBalancedTeams(signups.slice(0, 9)), /还差 1 位选手/);
});

test('getBalanceReadiness explains why auto balance cannot start', () => {
  assert.deepEqual(getBalanceReadiness(signups.slice(0, 9)), {
    canBalance: false,
    message: '还差 1 位选手才能自动分队'
  });
});

test('getBalanceReadiness allows exactly ten players', () => {
  assert.deepEqual(getBalanceReadiness(signups), {
    canBalance: true,
    message: ''
  });
});

test('applyMatchResult updates winner points and penalties', () => {
  const players = [
    { id: 'p1', name: 'Carry A', matches: 3, wins: 1, score: 92, mvp: 0, pigeon: 0, pressure: 0 },
    { id: 'p2', name: 'Mid A', matches: 3, wins: 2, score: 90, mvp: 0, pigeon: 0, pressure: 0 }
  ];

  const updated = applyMatchResult(players, {
    winnerIds: ['p1'],
    mvpId: 'p1',
    lateIds: ['p2'],
    pigeonIds: [],
    pressureIds: ['p2']
  });

  assert.deepEqual(updated.find((player) => player.id === 'p1'), {
    id: 'p1',
    name: 'Carry A',
    matches: 4,
    wins: 2,
    score: 96,
    mvp: 1,
    pigeon: 0,
    pressure: 0
  });
  assert.equal(updated.find((player) => player.id === 'p2').score, 87);
  assert.equal(updated.find((player) => player.id === 'p2').pressure, 1);
});


