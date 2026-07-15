const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { resetRoomForNewRound, isAdminOpenid } = require('../utils/adminRoom');
const { adminOpenids } = require('../utils/config');

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

test('all configured openids are recognized as administrators', () => {
  adminOpenids.forEach((openid) => {
    assert.equal(isAdminOpenid(openid, adminOpenids), true);
  });
  assert.equal(isAdminOpenid('ordinary-player', adminOpenids), false);
});

test('room page hides pigeon controls from non administrators', () => {
  const source = fs.readFileSync(path.join(__dirname, '../pages/room/room.wxml'), 'utf8');

  assert.match(source, /wx:if="\{\{isAdmin\}\}" class="section panel admin-panel"/);
  assert.match(source, /wx:if="\{\{isAdmin && pigeonCandidates\.length\}\}"/);
});

test('cloud settles daily honor winners when admin starts a new round', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const resetBlock = source.slice(
    source.indexOf('async function resetRoomSignups'),
    source.indexOf('async function adminRemoveSignup')
  );
  const voteBlock = source.slice(
    source.indexOf('async function voteHonor'),
    source.indexOf('async function settleHonorAwards')
  );

  assert.match(resetBlock, /settleHonorAwards\(room\.honors\)/);
  assert.doesNotMatch(voteBlock, /db\.collection\('players'\)\.doc/);
});
