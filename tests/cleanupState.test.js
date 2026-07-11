const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HISTORY_RESET_VERSION,
  needsHistoryReset,
  resetRoomHistoryState,
  resetPlayerStats
} = require('../utils/cleanupState');

test('needsHistoryReset only runs before current reset version', () => {
  assert.equal(needsHistoryReset({}), true);
  assert.equal(needsHistoryReset({ cleanupVersion: HISTORY_RESET_VERSION - 1 }), true);
  assert.equal(needsHistoryReset({ cleanupVersion: HISTORY_RESET_VERSION }), false);
});

test('resetRoomHistoryState clears votes and honors once', () => {
  const room = {
    id: 'today',
    votes: { mvp: { a: 'p1' }, touch: { b: 'p2' } },
    honors: { mvp: { name: 'A' }, touch: { name: 'B' } }
  };

  assert.deepEqual(resetRoomHistoryState(room), {
    id: 'today',
    votes: { mvp: {}, touch: {} },
    honors: { mvp: null, touch: null },
    cleanupVersion: HISTORY_RESET_VERSION
  });
});

test('resetPlayerStats keeps profile data and clears player stats', () => {
  assert.deepEqual(resetPlayerStats({
    id: 'openid-a',
    name: 'Real Player',
    avatarUrl: 'cloud://avatar',
    steamIds: ['123'],
    preferredPositions: [2, 4],
    score: 112,
    matches: 9,
    wins: 7,
    mvp: 3,
    touch: 4,
    pigeon: 2,
    pressure: 1
  }), {
    id: 'openid-a',
    name: 'Real Player',
    avatarUrl: 'cloud://avatar',
    steamIds: ['123'],
    preferredPositions: [2, 4],
    score: 80,
    matches: 0,
    wins: 0,
    mvp: 0,
    touch: 0,
    pigeon: 0,
    pressure: 0
  });
});
