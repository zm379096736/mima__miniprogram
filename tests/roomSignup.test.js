const test = require('node:test');
const assert = require('node:assert/strict');

const { joinRoom, leaveRoom, isSignedUp, getSignupState, assertCanJoinRoom } = require('../utils/roomSignup');

test('joinRoom adds player once', () => {
  const room = { signups: ['p2', 'p3'] };
  const player = { id: 'p1', profileCompleted: true };
  const updated = joinRoom(room, 'p1', player);
  const updatedAgain = joinRoom(updated, 'p1', player);

  assert.deepEqual(updated.signups, ['p2', 'p3', 'p1']);
  assert.deepEqual(updatedAgain.signups, ['p2', 'p3', 'p1']);
});

test('joinRoom puts the eleventh player into waitlist', () => {
  const room = { signups: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'] };
  const updated = joinRoom(room, 'p11', { id: 'p11', profileCompleted: true });

  assert.deepEqual(updated.signups, room.signups);
  assert.deepEqual(updated.waitlist, ['p11']);
});

test('leaveRoom removes player, promotes waitlist, and clears teams', () => {
  const room = { signups: ['p1', 'p2'], waitlist: ['p3', 'p4'], teams: { scoreGap: 0 }, status: 'ready' };
  const updated = leaveRoom(room, 'p1');

  assert.deepEqual(updated.signups, ['p2', 'p3']);
  assert.deepEqual(updated.waitlist, ['p4']);
  assert.equal(updated.teams, null);
});

test('leaveRoom removes waitlist player without changing formal signups', () => {
  const room = { signups: ['p1', 'p2'], waitlist: ['p3', 'p4'], teams: null };
  const updated = leaveRoom(room, 'p3');

  assert.deepEqual(updated.signups, ['p1', 'p2']);
  assert.deepEqual(updated.waitlist, ['p4']);
});

test('isSignedUp detects signup state', () => {
  assert.equal(isSignedUp({ signups: ['p1'] }, 'p1'), true);
  assert.equal(isSignedUp({ signups: ['p1'] }, 'p2'), false);
});

test('getSignupState separates formal signup and waitlist state', () => {
  const room = { signups: ['p1'], waitlist: ['p2'] };

  assert.equal(getSignupState(room, 'p1'), 'signup');
  assert.equal(getSignupState(room, 'p2'), 'waitlist');
  assert.equal(getSignupState(room, 'p3'), 'none');
});

test('assertCanJoinRoom rejects incomplete player cards', () => {
  assert.throws(() => assertCanJoinRoom({ id: 'p1', profileCompleted: false }));
});

test('assertCanJoinRoom accepts completed player cards', () => {
  assert.doesNotThrow(() => assertCanJoinRoom({ id: 'p1', profileCompleted: true }));
});
