const test = require('node:test');
const assert = require('node:assert/strict');

const { createPlayerIdentityService } = require('../cloudfunctions/api/playerIdentityService');

function clone(value) {
  return structuredClone(value);
}

function createDb(seed) {
  const state = clone(seed);
  function writer(target) {
    return {
      collection(name) {
        target[name] = target[name] || {};
        return {
          doc(id) {
            return {
              async get() {
                return { data: target[name][id] ? clone(target[name][id]) : null };
              },
              async update({ data }) {
                if (!target[name][id]) throw new Error('document not found');
                target[name][id] = { ...target[name][id], ...clone(data) };
              },
              async remove() {
                delete target[name][id];
              }
            };
          },
          limit() {
            return {
              async get() {
                return { data: Object.values(target[name]).map(clone) };
              }
            };
          }
        };
      }
    };
  }
  const db = writer(state);
  db.serverDate = () => 'server-date';
  db.runTransaction = async (callback) => {
    const working = clone(state);
    const result = await callback(writer(working));
    Object.keys(state).forEach((key) => { delete state[key]; });
    Object.assign(state, working);
    return result;
  };
  return { db, state };
}

function seed() {
  return {
    players: {
      real: {
        _id: 'real', id: 'real', openid: 'wx', name: '正式', temporary: false,
        steamIds: ['88'], points: 4, matches: 5, wins: 3, mvp: 2, touch: 1,
        pigeon: 0, pressure: 2, score: 92, preferredPositions: [2], profileCompleted: true
      },
      temp: {
        _id: 'temp', id: 'temp', openid: '', name: '临时', temporary: true,
        steamIds: ['12345'], points: 3, matches: 2, wins: 1, mvp: 1, touch: 2,
        pigeon: 1, pressure: 1
      }
    },
    matches: {
      old: {
        _id: 'old', id: 'old', matchId: '7001', participantIds: ['temp', 'p2'],
        winnerIds: ['temp'], radiant: [{ playerId: 'temp' }], dire: [{ playerId: 'p2' }]
      }
    },
    rooms: {
      today: {
        _id: 'today', id: 'today', signups: ['temp'], waitlist: [], rotationQueue: ['temp'],
        teams: null, votes: { mvp: {}, touch: {} }, honors: { mvp: null, touch: null }
      }
    }
  };
}

function preview() {
  return { radiant: [{ accountId: 12345, playerId: 'real' }], dire: [] };
}

test('preflight returns merge_required without database writes', async () => {
  const { db, state } = createDb(seed());
  const service = createPlayerIdentityService({ db });
  const before = clone(state);

  const result = await service.preflightPreview(preview(), []);

  assert.equal(result.status, 'merge_required');
  assert.equal(result.merges[0].temporaryPlayerId, 'temp');
  assert.deepEqual(state, before);
});

test('approved identity application migrates history room and player once', async () => {
  const { db, state } = createDb(seed());
  const service = createPlayerIdentityService({ db });
  const approvals = [{ temporaryPlayerId: 'temp', targetPlayerId: 'real' }];

  await db.runTransaction((transaction) => service.applyPreviewIdentity(transaction, preview(), approvals));

  assert.equal(state.players.temp, undefined);
  assert.equal(state.players.real.points, 7);
  assert.deepEqual(state.players.real.steamIds, ['88', '12345']);
  assert.deepEqual(state.matches.old.participantIds, ['real', 'p2']);
  assert.deepEqual(state.rooms.today.signups, ['real']);

  const second = await service.preflightPreview(preview(), approvals);
  assert.equal(second.status, 'ready');
  assert.equal(state.players.real.points, 7);
});

test('permanent conflict leaves the transaction unchanged', async () => {
  const value = seed();
  value.players.owner = {
    _id: 'owner', id: 'owner', name: '原主人', temporary: false, steamIds: ['12345']
  };
  value.players.temp.steamIds = [];
  const { db, state } = createDb(value);
  const service = createPlayerIdentityService({ db });
  const before = clone(state);

  await assert.rejects(
    db.runTransaction((transaction) => service.applyPreviewIdentity(transaction, preview(), [])),
    /已绑定正式选手“原主人”/
  );
  assert.deepEqual(state, before);
});

test('administrator identity update replaces ids and inherits merged temporary ids', async () => {
  const { db, state } = createDb(seed());
  const service = createPlayerIdentityService({ db });

  const preflight = await service.updatePlayerSteamIds('real', ['12345', '99'], []);
  assert.equal(preflight.status, 'merge_required');
  assert.deepEqual(state.players.real.steamIds, ['88']);

  const result = await service.updatePlayerSteamIds('real', ['12345', '99'], [
    { temporaryPlayerId: 'temp', targetPlayerId: 'real' }
  ]);
  assert.equal(result.status, 'updated');
  assert.deepEqual(state.players.real.steamIds, ['12345', '99']);
  assert.equal(state.players.real.points, 7);
  assert.equal(state.players.temp, undefined);
});
