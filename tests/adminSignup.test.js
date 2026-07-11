const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { removeSignupFromRoom } = require('../cloudfunctions/api/adminSignup');

test('admin removal promotes first waitlist player into formal signup', () => {
  const room = {
    signups: ['p1', 'p2'],
    waitlist: ['p3', 'p4'],
    teams: { scoreGap: 2 },
    status: '已分队'
  };

  assert.deepEqual(removeSignupFromRoom(room, 'p1'), {
    signups: ['p2', 'p3'],
    waitlist: ['p4'],
    teams: null,
    status: '报名中'
  });
});

test('admin removal deletes waitlist player without changing signups', () => {
  const room = {
    signups: ['p1', 'p2'],
    waitlist: ['p3'],
    teams: null,
    status: '候补中'
  };

  assert.deepEqual(removeSignupFromRoom(room, 'p3'), {
    signups: ['p1', 'p2'],
    waitlist: [],
    teams: null,
    status: '报名中'
  });
});

test('room page exposes admin-only single player removal control', () => {
  const source = fs.readFileSync(path.join(__dirname, '../pages/room/room.wxml'), 'utf8');

  assert.match(source, /wx:if="\{\{isAdmin\}\}" class="remove-player-btn"/);
  assert.match(source, /bindtap="adminRemoveSignup"/);
});

test('cloud action checks administrator before removing signup', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const actionBlock = source.slice(
    source.indexOf('async function adminRemoveSignup'),
    source.indexOf('async function markPigeons')
  );

  assert.match(actionBlock, /assertAdmin\(openid/);
  assert.match(source, /action === 'adminRemoveSignup'/);
});
