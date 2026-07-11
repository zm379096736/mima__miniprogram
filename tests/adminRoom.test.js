const test = require('node:test');
const assert = require('node:assert/strict');

const { resetRoomForNewRound, isAdminOpenid } = require('../utils/adminRoom');

test('resetRoomForNewRound clears signups waitlist teams and votes', () => {
  const room = {
    id: 'today',
    title: '今晚秘马开 C',
    status: '已分队',
    startTime: '21:30',
    signups: ['p1', 'p2'],
    waitlist: ['p3'],
    teams: { scoreGap: 1 },
    votes: { mvp: { a: 'p1' }, touch: { b: 'p2' } },
    honors: { mvp: { name: 'A' }, touch: { name: 'B' } }
  };

  assert.deepEqual(resetRoomForNewRound(room), {
    id: 'today',
    title: '今晚秘马开 C',
    status: '报名中',
    startTime: '21:30',
    signups: [],
    waitlist: [],
    teams: null,
    votes: { mvp: {}, touch: {} },
    honors: { mvp: null, touch: null }
  });
});

test('isAdminOpenid checks configured admin openids', () => {
  assert.equal(isAdminOpenid('admin-a', ['admin-a']), true);
  assert.equal(isAdminOpenid('player-a', ['admin-a']), false);
});
