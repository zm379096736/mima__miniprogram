const test = require('node:test');
const assert = require('node:assert/strict');

const { joinRoom, leaveRoom, isSignedUp } = require('../utils/roomSignup');

test('joinRoom adds player once', () => {
  const room = { signups: ['p2', 'p3'] };
  const updated = joinRoom(room, 'p1');
  const updatedAgain = joinRoom(updated, 'p1');

  assert.deepEqual(updated.signups, ['p2', 'p3', 'p1']);
  assert.deepEqual(updatedAgain.signups, ['p2', 'p3', 'p1']);
});

test('joinRoom rejects rooms with ten players', () => {
  const room = { signups: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'] };
  assert.throws(() => joinRoom(room, 'p11'), /报名人数已满/);
});

test('leaveRoom removes player and clears teams', () => {
  const room = { signups: ['p1', 'p2'], teams: { scoreGap: 0 }, status: '已分队' };
  const updated = leaveRoom(room, 'p1');

  assert.deepEqual(updated.signups, ['p2']);
  assert.equal(updated.teams, null);
  assert.equal(updated.status, '报名中');
});

test('isSignedUp detects signup state', () => {
  assert.equal(isSignedUp({ signups: ['p1'] }, 'p1'), true);
  assert.equal(isSignedUp({ signups: ['p1'] }, 'p2'), false);
});
