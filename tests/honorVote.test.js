const test = require('node:test');
const assert = require('node:assert/strict');

const { getVoteOptions, voteHonor, tallyHonors } = require('../utils/honorVote');

const players = [
  { id: 'p1', name: 'Carry' },
  { id: 'p2', name: 'Mid' },
  { id: 'p3', name: 'Offlane' }
];

test('getVoteOptions uses today signups as candidates', () => {
  assert.deepEqual(getVoteOptions({ signups: ['p1', 'p3'] }, players).map((player) => player.id), ['p1', 'p3']);
});

test('voteHonor stores one vote per voter and tallies winner', () => {
  const room = { signups: ['p1', 'p2'], votes: {}, honors: {} };
  const voted = voteHonor(room, 'mvp', 'openid-a', 'p1', players);
  const changed = voteHonor(voted, 'mvp', 'openid-a', 'p2', players);

  assert.deepEqual(changed.votes.mvp, { 'openid-a': 'p2' });
  assert.deepEqual(changed.honors.mvp, { playerId: 'p2', name: 'Mid', votes: 1 });
});

test('tallyHonors reports mvp and touch leaders', () => {
  assert.deepEqual(tallyHonors({
    mvp: { a: 'p1', b: 'p1', c: 'p2' },
    touch: { a: 'p3' }
  }, players), {
    mvp: { playerId: 'p1', name: 'Carry', votes: 2 },
    touch: { playerId: 'p3', name: 'Offlane', votes: 1 }
  });
});
