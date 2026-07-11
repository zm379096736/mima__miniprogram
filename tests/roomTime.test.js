const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRoomStartTime, updateRoomStartTime } = require('../utils/roomTime');

test('normalizeRoomStartTime accepts valid time', () => {
  assert.equal(normalizeRoomStartTime('20:30'), '20:30');
});

test('normalizeRoomStartTime rejects invalid time', () => {
  assert.throws(() => normalizeRoomStartTime('25:00'), /有效/);
  assert.throws(() => normalizeRoomStartTime('abc'), /有效/);
});

test('updateRoomStartTime changes only start time and keeps teams shape', () => {
  const room = { id: 'today', startTime: '21:30', signups: ['p1'], teams: { scoreGap: 0 } };
  assert.deepEqual(updateRoomStartTime(room, '22:15'), {
    id: 'today',
    startTime: '22:15',
    signups: ['p1'],
    teams: { scoreGap: 0 }
  });
});
