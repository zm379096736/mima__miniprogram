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
        { id: 'r1', name: 'Radiant Carry' },
        { id: 'r2', name: 'Radiant Mid' }
      ]
    },
    dire: {
      players: [
        { id: 'd1', name: 'Dire Carry' },
        { id: 'd2', name: 'Dire Mid' }
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
});
