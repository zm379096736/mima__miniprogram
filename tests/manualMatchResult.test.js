const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeWinnerSide,
  buildManualMatchUpdate,
  buildManualMatchRecord
} = require('../utils/manualMatchResult');

const room = {
  teams: {
    scoreGap: 6,
    radiant: {
      players: [
        { id: 'r1', name: 'Radiant Carry', score: 82, avatarUrl: 'cloud://env/r1.jpg' },
        { id: 'r2', name: 'Radiant Mid', score: 78, avatarUrl: 'cloud://env/r2.jpg' }
      ]
    },
    dire: {
      players: [
        { id: 'd1', name: 'Dire Carry', score: 80, avatarUrl: 'cloud://env/d1.jpg' },
        { id: 'd2', name: 'Dire Mid', score: 74, avatarUrl: 'cloud://env/d2.jpg' }
      ]
    }
  }
};

test('normalizeWinnerSide accepts radiant and dire only', () => {
  assert.equal(normalizeWinnerSide('radiant'), 'radiant');
  assert.equal(normalizeWinnerSide('dire'), 'dire');
  assert.throws(() => normalizeWinnerSide('bad'), /未知的胜方/);
});

test('buildManualMatchUpdate uses dire players when dire wins', () => {
  assert.deepEqual(buildManualMatchUpdate(room, 'dire'), {
    participantIds: ['r1', 'r2', 'd1', 'd2'],
    winnerIds: ['d1', 'd2'],
    mvpId: '',
    pressureId: '',
    winnerName: '夜魇',
    mvpName: '待投票'
  });
});

test('buildManualMatchRecord stores rollback fields for selected winner side', () => {
  const record = buildManualMatchRecord(room, 'dire', 123);

  assert.equal(record.id, 'm123');
  assert.equal(record.winner, '夜魇');
  assert.equal(record.mvp, '待投票');
  assert.equal(record.winnerSide, 'dire');
  assert.deepEqual(record.participantIds, ['r1', 'r2', 'd1', 'd2']);
  assert.deepEqual(record.winnerIds, ['d1', 'd2']);
  assert.equal(record.mvpId, '');
  assert.equal(record.pressureId, '');
  assert.equal(record.scoringVersion, 3);
  assert.deepEqual(record.radiant, [
    { playerId: 'r1', name: 'Radiant Carry', score: 82, avatarUrl: 'cloud://env/r1.jpg' },
    { playerId: 'r2', name: 'Radiant Mid', score: 78, avatarUrl: 'cloud://env/r2.jpg' }
  ]);
  assert.deepEqual(record.dire, [
    { playerId: 'd1', name: 'Dire Carry', score: 80, avatarUrl: 'cloud://env/d1.jpg' },
    { playerId: 'd2', name: 'Dire Mid', score: 74, avatarUrl: 'cloud://env/d2.jpg' }
  ]);
  assert.equal(record.radiantScore, 160);
  assert.equal(record.direScore, 154);
});

test('manual match helpers use submitted actual lineup instead of planned teams', () => {
  const actualLineup = {
    participantIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'b2', 'b3', 'b4', 'b5'],
    radiantPlayerIds: ['a1', 'a2', 'a3', 'a4', 'a5'],
    direPlayerIds: ['b1', 'b2', 'b3', 'b4', 'b5'],
    radiant: [{ playerId: 'a1', name: 'Actual Radiant' }],
    dire: [{ playerId: 'b1', name: 'Actual Dire' }],
    radiantScore: 401,
    direScore: 392,
    scoreGap: 9
  };

  const update = buildManualMatchUpdate(room, 'dire', actualLineup);
  const record = buildManualMatchRecord(room, 'dire', 456, actualLineup);

  assert.deepEqual(update.participantIds, actualLineup.participantIds);
  assert.deepEqual(update.winnerIds, actualLineup.direPlayerIds);
  assert.deepEqual(record.radiant, actualLineup.radiant);
  assert.deepEqual(record.dire, actualLineup.dire);
  assert.equal(record.scoreGap, 9);
  assert.equal(record.radiantScore, 401);
  assert.equal(record.direScore, 392);
  assert.equal(record.lineupSource, 'manual-reconciled');
});
