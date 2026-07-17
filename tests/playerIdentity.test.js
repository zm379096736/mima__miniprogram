const test = require('node:test');
const assert = require('node:assert/strict');

const {
  canonicalAccountId,
  buildSteamBindingPlan,
  mergePlayerData,
  replacePlayerIdInMatch,
  replacePlayerIdInRoom,
  assertMergeHasNoCollision
} = require('../cloudfunctions/api/playerIdentity');

function preview(accountId, playerId) {
  return { radiant: [{ accountId, playerId }], dire: [] };
}

test('canonical account ids accept account id and Steam64 aliases', () => {
  assert.equal(canonicalAccountId('12345'), '12345');
  assert.equal(canonicalAccountId('76561197960278073'), '12345');
  assert.equal(canonicalAccountId('not-an-id'), '');
});

test('unowned imported account id is planned for the selected player', () => {
  const plan = buildSteamBindingPlan(preview(12345, 'target'), [
    { id: 'target', temporary: false, steamIds: ['88'] }
  ]);

  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.bindings, [{ playerId: 'target', accountIds: ['12345'] }]);
  assert.deepEqual(plan.merges, []);
});

test('Steam64 alias already owned by selected player is not duplicated', () => {
  const plan = buildSteamBindingPlan(preview(12345, 'target'), [
    { id: 'target', temporary: false, steamIds: ['76561197960278073'] }
  ]);

  assert.deepEqual(plan.bindings, []);
});

test('permanent owner conflict names the id and owner', () => {
  assert.throws(
    () => buildSteamBindingPlan(preview(12345, 'target'), [
      { id: 'target', name: '目标', temporary: false },
      { id: 'owner', name: '小柿', temporary: false, steamIds: ['12345'] }
    ]),
    /Steam ID 12345 已绑定正式选手“小柿”/
  );
});

test('temporary owner returns a no-write merge requirement', () => {
  const plan = buildSteamBindingPlan(preview(12345, 'target'), [
    { id: 'target', name: '正式', temporary: false },
    { id: 'temp', name: '临时', temporary: true, openid: '', steamIds: ['12345'] }
  ]);

  assert.equal(plan.status, 'merge_required');
  assert.deepEqual(plan.merges, [{
    temporaryPlayerId: 'temp',
    temporaryName: '临时',
    targetPlayerId: 'target',
    targetName: '正式',
    accountIds: ['12345']
  }]);
});

test('exact approval makes a temporary merge plan ready', () => {
  const plan = buildSteamBindingPlan(preview(12345, 'target'), [
    { id: 'target', name: '正式', temporary: false },
    { id: 'temp', name: '临时', temporary: true, openid: '', steamIds: ['12345'] }
  ], [{ temporaryPlayerId: 'temp', targetPlayerId: 'target' }]);

  assert.equal(plan.status, 'ready');
  assert.equal(plan.merges[0].temporaryPlayerId, 'temp');
});

test('temporary merge preserves permanent profile and combines counters and ids', () => {
  const merged = mergePlayerData(
    { id: 'temp', temporary: true, steamIds: ['12345'], points: 3, matches: 2, wins: 1, mvp: 1, touch: 2, pigeon: 1, pressure: 1 },
    { id: 'real', openid: 'wx', name: '正式', avatarUrl: 'cloud://avatar', score: 92,
      preferredPositions: [2, 3], profileCompleted: true, steamIds: ['88'], points: 4,
      matches: 5, wins: 3, mvp: 2, touch: 1, pigeon: 0, pressure: 2 }
  );

  assert.equal(merged.openid, 'wx');
  assert.equal(merged.name, '正式');
  assert.equal(merged.score, 92);
  assert.deepEqual(merged.steamIds, ['88', '12345']);
  assert.deepEqual(
    [merged.points, merged.matches, merged.wins, merged.mvp, merged.touch, merged.pigeon, merged.pressure],
    [7, 7, 4, 3, 3, 1, 3]
  );
});

test('match and room migration replace every player reference', () => {
  const match = replacePlayerIdInMatch({
    participantIds: ['temp', 'p2'], winnerIds: ['temp'], plannedParticipantIds: ['temp'],
    radiant: [{ playerId: 'temp' }], dire: [{ playerId: 'p2' }],
    mvpId: 'temp', pressureId: 'temp'
  }, 'temp', 'real');
  assert.deepEqual(match.participantIds, ['real', 'p2']);
  assert.equal(match.radiant[0].playerId, 'real');
  assert.equal(match.mvpId, 'real');

  const room = replacePlayerIdInRoom({
    signups: ['temp'], waitlist: [], rotationQueue: ['temp'],
    teams: { radiant: { players: [{ id: 'temp' }] }, dire: { players: [] } },
    votes: { mvp: { temp: 'p2', voter: 'temp' }, touch: {} },
    honors: { mvp: { playerId: 'temp' }, touch: null }
  }, 'temp', 'real');
  assert.deepEqual(room.signups, ['real']);
  assert.equal(room.teams.radiant.players[0].id, 'real');
  assert.equal(room.votes.mvp.real, 'p2');
  assert.equal(room.votes.mvp.voter, 'real');
  assert.equal(room.honors.mvp.playerId, 'real');
});

test('merge rejects historical or active-team double participation', () => {
  assert.throws(() => assertMergeHasNoCollision([
    { id: 'm1', participantIds: ['temp', 'real'] }
  ], null, 'temp', 'real'), /同一场历史比赛/);
  assert.throws(() => assertMergeHasNoCollision([], {
    teams: { radiant: { players: [{ id: 'temp' }] }, dire: { players: [{ id: 'real' }] } }
  }, 'temp', 'real'), /当前分队/);
});
