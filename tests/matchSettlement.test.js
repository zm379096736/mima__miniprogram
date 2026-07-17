const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSettlement,
  settleImportedMatch
} = require('../cloudfunctions/api/matchSettlement');

function previewFixture(overrides = {}) {
  return {
    matchId: '7002',
    radiantWin: true,
    radiantKills: 20,
    direKills: 10,
    duration: 1800,
    startTime: 1710000000,
    winner: 'Radiant',
    radiant: Array.from({ length: 5 }, (_, index) => ({
      accountId: index + 1,
      playerId: `r${index + 1}`,
      name: `Radiant ${index + 1}`,
      heroId: 39,
      kills: index + 1,
      deaths: 2,
      assists: 8,
      goldPerMin: 600 + index,
      xpPerMin: 700 + index
    })),
    dire: Array.from({ length: 5 }, (_, index) => ({
      accountId: index + 6,
      playerId: `d${index + 1}`,
      name: `Dire ${index + 1}`,
      kills: index + 1
    })),
    ...overrides
  };
}

function playersFor(preview) {
  return preview.radiant.concat(preview.dire).map((row, index) => ({
    _id: `doc-${index + 1}`,
    id: row.playerId,
    score: 80 + index,
    avatarUrl: `cloud://env/avatars/${row.playerId}.jpg`,
    points: index,
    matches: 3,
    wins: index % 2
  }));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTransactionDb(state, options = {}) {
  function writerFor(target) {
    return {
      collection(name) {
        return {
          doc(id) {
            return {
              async get() {
                if (name === 'matches' && options.matchReadError) {
                  throw options.matchReadError;
                }
                if (!target[name][id] && name === 'matches' && options.missingMatchThrows) {
                  const error = new Error('document.get:fail document not exists');
                  error.errMsg = 'document.get:fail document not exists';
                  throw error;
                }
                return { data: target[name][id] ? clone(target[name][id]) : null };
              },
              async update({ data }) {
                if (options.failPlayerId === target[name][id].id) {
                  throw new Error('simulated player write failure');
                }
                Object.assign(target[name][id], clone(data));
              },
              async set({ data }) {
                target[name][id] = { _id: id, ...clone(data) };
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

  const db = writerFor(state);
  db.serverDate = () => 'server-date';
  db.runTransaction = async (callback) => {
    const working = clone(state);
    const result = await callback(writerFor(working));
    state.players = working.players;
    state.matches = working.matches;
    return result;
  };
  return db;
}

function transactionState(preview, overrides = {}) {
  const players = playersFor(preview);
  return {
    players: Object.fromEntries(players.map((player) => [player._id, player])),
    matches: {},
    rooms: {},
    ...overrides
  };
}

function executeSettlement(preview, metadata, db) {
  assert.equal(typeof settleImportedMatch, 'function');
  return settleImportedMatch(preview, metadata, { db });
}

test('buildSettlement creates rollback-safe imported records and player updates', () => {
  const preview = previewFixture();
  const result = buildSettlement(preview, playersFor(preview), {
    source: 'league-auto',
    leagueId: '20040'
  });

  assert.deepEqual(result.match, {
    id: 'imported-7002',
    matchId: '7002',
    title: 'Dota \u6bd4\u8d5b 7002',
    winner: 'Radiant',
    winnerSide: 'radiant',
    mvp: '\u5f85\u6295\u7968',
    scoreGap: 10,
    scoringVersion: 3,
    imported: true,
    source: 'league-auto',
    leagueId: '20040',
    lineupSource: 'league-auto',
    radiantWin: true,
    duration: 1800,
    startTime: 1710000000,
    radiant: preview.radiant.map((row, index) => ({
      ...row,
      score: 80 + index,
      avatarUrl: `cloud://env/avatars/${row.playerId}.jpg`,
      temporary: false
    })),
    dire: preview.dire.map((row, index) => ({
      ...row,
      score: 85 + index,
      avatarUrl: `cloud://env/avatars/${row.playerId}.jpg`,
      temporary: false
    })),
    participantIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'd1', 'd2', 'd3', 'd4', 'd5'],
    winnerIds: ['r1', 'r2', 'r3', 'r4', 'r5']
  });
  assert.deepEqual(result.playerUpdates[0], {
    _id: 'doc-1', id: 'r1', points: 2, matches: 4, wins: 1
  });
  assert.deepEqual(result.playerUpdates[5], {
    _id: 'doc-6', id: 'd1', points: 4, matches: 4, wins: 1
  });
  assert.equal(result.playerUpdates.length, 10);
  assert.equal(result.playerUpdates[0].score, undefined);
  assert.equal(result.match.radiant[0].heroId, 39);
  assert.equal(result.match.radiant[0].goldPerMin, 600);
  assert.equal(result.match.radiant[0].xpPerMin, 700);
  assert.equal(result.match.radiant[0].score, 80);
  assert.equal(result.match.radiant[0].avatarUrl, 'cloud://env/avatars/r1.jpg');
});

test('buildSettlement defaults manual imports to the reconciled source metadata', () => {
  const preview = previewFixture({ radiantWin: false, winner: 'Dire' });
  const result = buildSettlement(preview, playersFor(preview));

  assert.equal(result.match.source, 'manual-import');
  assert.equal(result.match.leagueId, '');
  assert.equal(result.match.lineupSource, 'import-reconciled');
  assert.equal(result.match.winnerSide, 'dire');
  assert.deepEqual(result.match.winnerIds, ['d1', 'd2', 'd3', 'd4', 'd5']);
  assert.equal(result.playerUpdates.find((update) => update.id === 'r1').points, -1);
  assert.equal(result.playerUpdates.find((update) => update.id === 'd1').points, 7);
});

test('buildSettlement stores league name and discovery source when supplied', () => {
  const preview = previewFixture();
  const result = buildSettlement(preview, playersFor(preview), {
    source: 'league-auto',
    leagueId: '19608',
    leagueName: '斐济杯',
    discoverySource: 'valve'
  });
  assert.equal(result.match.leagueId, '19608');
  assert.equal(result.match.leagueName, '斐济杯');
  assert.equal(result.match.discoverySource, 'valve');
});

test('buildSettlement rejects incomplete duplicate and missing player lineups', () => {
  const preview = previewFixture({
    radiant: Array.from({ length: 4 }, (_, index) => ({ playerId: `r${index + 1}` })),
    dire: Array.from({ length: 5 }, (_, index) => ({ playerId: `d${index + 1}` }))
  });
  assert.throws(() => buildSettlement(preview, playersFor(preview)), /10 distinct players/);

  const duplicatePreview = previewFixture({
    dire: [{ playerId: 'r1' }, ...Array.from({ length: 4 }, (_, index) => ({ playerId: `d${index + 1}` }))]
  });
  assert.throws(() => buildSettlement(duplicatePreview, playersFor(duplicatePreview)), /10 distinct players/);

  const missingPlayerPreview = previewFixture();
  const players = playersFor(missingPlayerPreview).filter((player) => player.id !== 'd5');
  assert.throws(() => buildSettlement(missingPlayerPreview, players), /does not exist/);
});

test('settleImportedMatch rejects a deterministic duplicate without player changes', async () => {
  const preview = previewFixture();
  const state = transactionState(preview, {
    matches: {
      'imported-7002': { _id: 'imported-7002', id: 'imported-7002' }
    }
  });
  const before = clone(state);

  await assert.rejects(
    executeSettlement(preview, { players: playersFor(preview) }, createTransactionDb(state)),
    new RegExp('\u5df2\u7ecf\u5bfc\u5165')
  );
  assert.deepEqual(state, before);
});

test('settleImportedMatch creates the first match when a missing document read throws', async () => {
  const preview = previewFixture();
  const state = transactionState(preview);

  await executeSettlement(
    preview,
    { players: playersFor(preview) },
    createTransactionDb(state, { missingMatchThrows: true })
  );

  assert.equal(state.matches['imported-7002']._id, 'imported-7002');
  assert.equal(state.players['doc-1'].matches, 4);
});

test('settleImportedMatch rethrows non-not-found match read errors without player changes', async () => {
  const preview = previewFixture();
  const state = transactionState(preview);
  const before = clone(state);

  await assert.rejects(
    executeSettlement(
      preview,
      { players: playersFor(preview) },
      createTransactionDb(state, { matchReadError: new Error('database unavailable') })
    ),
    /database unavailable/
  );
  assert.deepEqual(state, before);
});

test('settleImportedMatch aborts every write when a transaction player write fails', async () => {
  const preview = previewFixture();
  const state = transactionState(preview);
  const before = clone(state);

  await assert.rejects(
    executeSettlement(
      preview,
      { players: playersFor(preview) },
      createTransactionDb(state, { failPlayerId: 'd1' })
    ),
    /simulated player write failure/
  );
  assert.deepEqual(state, before);
});

test('settleImportedMatch calculates totals from transaction player snapshots', async () => {
  const preview = previewFixture();
  const stalePlayers = playersFor(preview);
  const state = transactionState(preview);
  state.players['doc-1'] = {
    ...state.players['doc-1'],
    points: 10,
    matches: 7,
    wins: 2
  };

  const match = await executeSettlement(
    preview,
    { players: stalePlayers },
    createTransactionDb(state)
  );

  assert.equal(match._id, undefined);
  assert.deepEqual(state.players['doc-1'], {
    ...state.players['doc-1'],
    points: 12,
    matches: 8,
    wins: 3,
    updatedAt: 'server-date'
  });
  assert.equal(state.matches['imported-7002']._id, 'imported-7002');
  assert.equal(state.matches['imported-7002'].createdAt, 'server-date');
});

test('settlement atomically binds account ids with scoring', async () => {
  const preview = previewFixture();
  const state = transactionState(preview);

  await executeSettlement(preview, { players: playersFor(preview) }, createTransactionDb(state));

  assert.deepEqual(state.players['doc-1'].steamIds, ['1']);
  assert.equal(state.players['doc-1'].matches, 4);
  assert.ok(state.matches['imported-7002']);
});

test('duplicate match does not add a new Steam binding', async () => {
  const preview = previewFixture();
  const state = transactionState(preview, {
    matches: { 'imported-7002': { _id: 'imported-7002', id: 'imported-7002' } }
  });

  await assert.rejects(
    executeSettlement(preview, {}, createTransactionDb(state)),
    /已经导入/
  );
  assert.deepEqual(state.players['doc-1'].steamIds || [], []);
});
