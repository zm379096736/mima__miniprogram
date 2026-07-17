const test = require('node:test');
const assert = require('node:assert/strict');

const TOKEN = 'league-sync-test-token-1234567890abcdef';
const LEAGUE_SYNC_START_TIME = 1784304000;
process.env.LEAGUE_SYNC_TOKEN = TOKEN;

const {
  assertLeagueSyncToken,
  nextRetryAt
} = require('../cloudfunctions/api/leagueSyncState');
const { createLeagueSyncApi } = require('../cloudfunctions/api/leagueSyncApi');
const { normalizeLeagueMatchIds } = require('../cloudfunctions/api/leagueSyncCore');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createDb(seed = {}, options = {}) {
  const state = clone(seed);
  const queryLog = [];
  let transactionTail = Promise.resolve();

  function collection(name, context = { transaction: false }) {
    state[name] = state[name] || {};
    let where = null;
    let order = null;
    let maximum = Infinity;

    const query = {
      doc(id) {
        return {
          async get() {
            const details = { name, id, transaction: context.transaction, state };
            if (options.beforeDocumentGet) await options.beforeDocumentGet(details);
            const data = clone(state[name][id]);
            if (options.afterDocumentGet) {
              await options.afterDocumentGet({ ...details, data, exists: Boolean(data) });
            }
            if (!data) {
              throw new Error(options.missingDocumentMessage || 'document.get:fail document not exists');
            }
            return { data };
          },
          async set({ data }) {
            const details = { name, id, data: clone(data), transaction: context.transaction, state };
            if (options.beforeDocumentSet) await options.beforeDocumentSet(details);
            state[name][id] = { ...clone(data), _id: id };
            if (options.afterDocumentSet) await options.afterDocumentSet(details);
            return { updated: 1 };
          },
          async update({ data }) {
            const details = { name, id, data: clone(data), transaction: context.transaction, state };
            if (options.beforeDocumentUpdate) await options.beforeDocumentUpdate(details);
            if (!state[name][id]) {
              throw new Error('document.update:fail document not exists');
            }
            state[name][id] = { ...state[name][id], ...clone(data), _id: id };
            if (options.afterDocumentUpdate) await options.afterDocumentUpdate(details);
            return { updated: 1 };
          }
        };
      },
      where(criteria) {
        where = criteria;
        return query;
      },
      orderBy(field, direction) {
        order = { field, direction };
        return query;
      },
      limit(value) {
        maximum = value;
        return query;
      },
      async get() {
        queryLog.push({ name, where: clone(where), order: clone(order), maximum });
        let rows = Object.values(state[name]);
        if (where) {
          rows = rows.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value));
        }
        if (order) {
          rows.sort((left, right) => {
            const leftValue = left[order.field] instanceof Date ? left[order.field].getTime() : left[order.field];
            const rightValue = right[order.field] instanceof Date ? right[order.field].getTime() : right[order.field];
            if (leftValue === rightValue) return 0;
            const result = leftValue > rightValue ? 1 : -1;
            return order.direction === 'desc' ? -result : result;
          });
        }
        return { data: clone(rows.slice(0, maximum)) };
      },
      async count() {
        const result = await query.get();
        return { total: result.data.length };
      }
    };
    return query;
  }

  return {
    state,
    queryLog,
    collection,
    async runTransaction(callback) {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        return await callback({
          collection: (name) => collection(name, { transaction: true })
        });
      } finally {
        release();
      }
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function readyPreview(matchId) {
  const side = (offset) => Array.from({ length: 5 }, (_, index) => ({
    accountId: offset + index,
    playerId: `p${offset + index}`,
    name: `Player ${offset + index}`,
    matched: true,
    ambiguous: false,
    kills: index,
    deaths: 1,
    assists: 2
  }));
  return {
    matchId: String(matchId),
    startTime: LEAGUE_SYNC_START_TIME,
    radiantWin: true,
    radiantKills: 10,
    direKills: 5,
    radiant: side(1),
    dire: side(6),
    matchedCount: 10
  };
}

function createApi(db, overrides = {}) {
  const now = overrides.now || new Date('2026-07-17T02:00:00.000Z');
  return createLeagueSyncApi({
    db,
    isAdminOpenid: (openid) => openid === 'admin',
    normalizeLeagueMatchIds,
    loadPreview: overrides.loadPreview || (async (matchId) => readyPreview(matchId)),
    settleImportedMatch: overrides.settleImportedMatch || (async () => ({})),
    applyActualLineupToPreview: overrides.applyActualLineupToPreview || ((preview) => preview),
    getPlayers: overrides.getPlayers || (async () => []),
    now: () => new Date(now),
    createLockOwner: overrides.createLockOwner || (() => 'lock-owner-a')
  });
}

test('internal token rejects missing, short, and mismatched values without disclosure', () => {
  const configured = process.env.LEAGUE_SYNC_TOKEN;
  for (const supplied of ['', 'short', `${configured}-wrong`, '\u754c'.repeat(configured.length)]) {
    assert.throws(
      () => assertLeagueSyncToken(supplied),
      (error) => {
        assert.equal(error.message.includes(configured), false);
        if (supplied) {
          assert.equal(error.message.includes(supplied), false);
        }
        return /authorization/i.test(error.message);
      }
    );
  }

  process.env.LEAGUE_SYNC_TOKEN = 'too-short';
  assert.throws(() => assertLeagueSyncToken('too-short'), /authorization/i);
  process.env.LEAGUE_SYNC_TOKEN = configured;
  assert.equal(assertLeagueSyncToken(configured), true);
});

test('nextRetryAt follows the capped retry schedule', () => {
  const now = new Date('2026-07-17T02:00:00.000Z');
  assert.equal(nextRetryAt(1, now).toISOString(), '2026-07-17T02:05:00.000Z');
  assert.equal(nextRetryAt(2, now).toISOString(), '2026-07-17T02:15:00.000Z');
  assert.equal(nextRetryAt(6, now).toISOString(), '2026-07-17T08:00:00.000Z');
  assert.equal(nextRetryAt(99, now).toISOString(), '2026-07-17T08:00:00.000Z');
});

test('discovery uses normalized IDs and preserves imported and review rows', async () => {
  const db = createDb({
    leagueSyncQueue: {
      700002: { _id: '700002', matchId: '700002', status: 'imported', importedAt: 'kept' },
      700003: { _id: '700003', matchId: '700003', status: 'needs_review', preview: { chosen: true } }
    }
  });
  const api = createApi(db);

  await assert.rejects(api.discoverLeagueMatches('bad-token', [{ match_id: 700001 }]), /authorization/i);
  const result = await api.discoverLeagueMatches(TOKEN, [
    { match_id: 700001 },
    { match_id: '700002' },
    { match_id: '700003' },
    { match_id: 700001 },
    { match_id: 'invalid' }
  ], { leagueId: '19608', leagueName: '斐济杯', discoverySource: 'opendota' });

  assert.deepEqual(result, { discovered: 3, inserted: 1 });
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'discovered');
  assert.equal(db.state.leagueSyncQueue['700001'].leagueId, '19608');
  assert.equal(db.state.leagueSyncQueue['700001'].leagueName, '斐济杯');
  assert.equal(db.state.leagueSyncQueue['700001'].discoverySource, 'opendota');
  assert.equal(db.state.leagueSyncQueue['700002'].importedAt, 'kept');
  assert.deepEqual(db.state.leagueSyncQueue['700003'].preview, { chosen: true });
});

test('discovery create-if-absent cannot overwrite a concurrent review row', async () => {
  let raced = false;
  const insertReview = ({ state }) => {
    state.leagueSyncQueue['700001'] = {
      _id: '700001',
      matchId: '700001',
      status: 'needs_review',
      preview: { chosen: true }
    };
    raced = true;
  };
  const db = createDb({ leagueSyncQueue: {} }, {
    beforeDocumentGet(details) {
      if (details.transaction && details.name === 'leagueSyncQueue'
        && details.id === '700001' && !raced) insertReview(details);
    },
    afterDocumentGet(details) {
      if (!details.transaction && details.name === 'leagueSyncQueue'
        && details.id === '700001' && !details.exists && !raced) insertReview(details);
    }
  });
  const api = createApi(db);

  const result = await api.discoverLeagueMatches(TOKEN, [{ match_id: 700001 }]);

  assert.deepEqual(result, { discovered: 1, inserted: 0 });
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'needs_review');
  assert.deepEqual(db.state.leagueSyncQueue['700001'].preview, { chosen: true });
});

test('administrator retry resets only retryable queue rows', async () => {
  const retryAt = new Date('2026-07-17T03:00:00.000Z');
  const db = createDb({
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'failed', attempts: 3, error: 'safe', nextRetryAt: retryAt },
      700002: { _id: '700002', matchId: '700002', status: 'imported' }
    }
  });
  const api = createApi(db);

  await assert.rejects(api.retryLeagueSyncMatch('player', '700001'), /administrator/i);
  await assert.rejects(api.retryLeagueSyncMatch('admin', '700002'), /retryable/i);
  const row = await api.retryLeagueSyncMatch('admin', '700001');

  assert.equal(row.status, 'discovered');
  assert.equal(row.attempts, 3);
  assert.equal(db.state.leagueSyncQueue['700001'].error, '');
  assert.equal(db.state.leagueSyncQueue['700001'].nextRetryAt, null);
});

test('administrator retry cannot regress a concurrently imported queue row', async () => {
  let raced = false;
  const markImported = ({ state }) => {
    state.leagueSyncQueue['700001'] = {
      ...state.leagueSyncQueue['700001'],
      status: 'imported',
      importedAt: 'concurrent'
    };
    raced = true;
  };
  const db = createDb({
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'failed' }
    }
  }, {
    beforeDocumentGet(details) {
      if (details.transaction && details.name === 'leagueSyncQueue'
        && details.id === '700001' && !raced) markImported(details);
    },
    afterDocumentGet(details) {
      if (!details.transaction && details.name === 'leagueSyncQueue'
        && details.id === '700001' && details.data.status === 'failed' && !raced) markImported(details);
    }
  });
  const api = createApi(db);

  await assert.rejects(api.retryLeagueSyncMatch('admin', '700001'), /retryable/i);

  assert.equal(db.state.leagueSyncQueue['700001'].status, 'imported');
  assert.equal(db.state.leagueSyncQueue['700001'].importedAt, 'concurrent');
});

test('administrator retry converges an authoritative imported match without scoring', async () => {
  const db = createDb({
    matches: {
      'imported-700001': { _id: 'imported-700001', matchId: '700001' }
    },
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'failed', attempts: 1 }
    }
  });
  const api = createApi(db, {
    settleImportedMatch: async () => assert.fail('retry must not settle again')
  });

  const row = await api.retryLeagueSyncMatch('admin', '700001');

  assert.equal(row.status, 'imported');
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'imported');
});

test('administrator can pause and resume the deterministic default sync state', async () => {
  const db = createDb();
  const api = createApi(db);

  await assert.rejects(api.setLeagueSyncEnabled('player', false), /administrator/i);
  const paused = await api.setLeagueSyncEnabled('admin', false);

  assert.equal(paused.enabled, false);
  assert.equal(paused.leagueId, '20040');
  assert.equal(db.state.system.leagueSync._id, 'leagueSync');
  assert.equal(db.state.system.leagueSync.lockOwner, '');
  assert.equal(db.state.system.leagueSync.lockExpiresAt, null);

  const resumed = await api.setLeagueSyncEnabled('admin', true);
  assert.equal(resumed.enabled, true);
});

test('first client state read initializes when cloud reports document does not exist', async () => {
  const db = createDb({}, {
    missingDocumentMessage: 'document.get:fail document with _id leagueSync does not exist'
  });
  const api = createApi(db);

  const state = await api.getClientLeagueSyncState('player');

  assert.equal(state.enabled, true);
  assert.equal(state.leagueId, '20040');
  assert.equal(db.state.system.leagueSync._id, 'leagueSync');
});

test('processing respects pause and a live five-minute lock', async () => {
  let loads = 0;
  const db = createDb({
    system: {
      leagueSync: { _id: 'leagueSync', leagueId: '20040', enabled: false }
    },
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'discovered' }
    }
  });
  const api = createApi(db, { loadPreview: async () => { loads += 1; return readyPreview('700001'); } });

  assert.deepEqual(await api.processLeagueQueue(TOKEN, 1), { skipped: true, reason: 'paused' });
  db.state.system.leagueSync.enabled = true;
  db.state.system.leagueSync.lockOwner = 'other-owner';
  db.state.system.leagueSync.lockExpiresAt = new Date('2026-07-17T02:04:59.000Z');
  assert.deepEqual(await api.processLeagueQueue(TOKEN, 1), { skipped: true, reason: 'locked' });
  assert.equal(loads, 0);
});

test('processing ignores pre-start matches and retries missing start times', async () => {
  const db = createDb({
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'discovered' },
      700002: { _id: '700002', matchId: '700002', status: 'discovered' },
      700003: { _id: '700003', matchId: '700003', status: 'discovered' }
    }
  });
  const settled = [];
  const api = createApi(db, {
    loadPreview: async (matchId) => {
      const preview = readyPreview(matchId);
      if (matchId === '700001') preview.startTime = LEAGUE_SYNC_START_TIME - 1;
      if (matchId === '700002') preview.startTime = 0;
      return preview;
    },
    settleImportedMatch: async (preview) => settled.push(preview.matchId)
  });

  const result = await api.processLeagueQueue(TOKEN, 3);
  const state = await api.getClientLeagueSyncState('admin');

  assert.deepEqual(result, {
    skipped: false,
    processed: 3,
    imported: 1,
    needsReview: 0,
    waitingData: 1,
    failed: 0
  });
  assert.deepEqual(settled, ['700003']);
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'ignored_before_start');
  assert.equal(db.state.leagueSyncQueue['700002'].status, 'waiting_data');
  assert.equal(db.state.leagueSyncQueue['700003'].status, 'imported');
  assert.equal(state.pendingCount, 1);
});

test('concurrent first runs initialize and acquire the state lock atomically', async () => {
  const bothMissing = deferred();
  const lockWritten = deferred();
  let missingReads = 0;
  let outsideSets = 0;
  const db = createDb({}, {
    async afterDocumentGet(details) {
      if (details.name !== 'system' || details.id !== 'leagueSync'
        || details.transaction || details.exists) return;
      missingReads += 1;
      if (missingReads === 2) bothMissing.resolve();
      await bothMissing.promise;
    },
    async beforeDocumentSet(details) {
      if (details.name !== 'system' || details.id !== 'leagueSync' || details.transaction) return;
      outsideSets += 1;
      if (outsideSets === 2) await lockWritten.promise;
    },
    afterDocumentUpdate(details) {
      if (details.name === 'system' && details.id === 'leagueSync'
        && details.transaction && details.data.lockOwner) lockWritten.resolve();
    }
  });
  let owner = 0;
  const api = createApi(db, { createLockOwner: () => `owner-${owner += 1}` });

  const results = await Promise.all([
    api.processLeagueQueue(TOKEN, 1),
    api.processLeagueQueue(TOKEN, 1)
  ]);

  assert.equal(results.filter((result) => result.skipped === false).length, 1);
  assert.equal(results.filter((result) => result.reason === 'locked').length, 1);
  assert.equal(outsideSets, 0);
});

test('a concurrent first state reader cannot clobber a newly acquired lock', async () => {
  const lockWritten = deferred();
  let outsideSets = 0;
  const db = createDb({}, {
    async afterDocumentGet(details) {
      if (details.name === 'system' && details.id === 'leagueSync'
        && !details.transaction && !details.exists) await lockWritten.promise;
    },
    beforeDocumentSet(details) {
      if (details.name === 'system' && details.id === 'leagueSync' && !details.transaction) {
        outsideSets += 1;
      }
    },
    afterDocumentSet(details) {
      if (details.name === 'system' && details.id === 'leagueSync'
        && details.transaction && details.data.lockOwner) lockWritten.resolve();
    }
  });
  const api = createApi(db);

  await Promise.all([
    api.getLeagueSyncStateInternal(TOKEN),
    api.processLeagueQueue(TOKEN, 1)
  ]);

  assert.equal(outsideSets, 0);
});

test('due retries are selected before a page of future retries', async () => {
  const future = new Date('2026-07-17T03:00:00.000Z');
  const due = new Date('2026-07-17T01:59:00.000Z');
  const db = createDb({ leagueSyncQueue: {} });
  for (let index = 0; index < 999; index += 1) {
    const matchId = String(710000 + index);
    db.state.leagueSyncQueue[matchId] = {
      _id: matchId,
      matchId,
      status: 'waiting_data',
      nextRetryAt: future
    };
  }
  db.state.leagueSyncQueue['799999'] = {
    _id: '799999',
    matchId: '799999',
    status: 'waiting_data',
    nextRetryAt: due
  };
  const loaded = [];
  const api = createApi(db, {
    loadPreview: async (matchId) => {
      loaded.push(matchId);
      return readyPreview(matchId);
    }
  });

  const result = await api.processLeagueQueue(TOKEN, 1);

  assert.equal(result.processed, 1);
  assert.deepEqual(loaded, ['799999']);
  assert.equal(db.state.leagueSyncQueue['799999'].status, 'imported');
  const queueReads = db.queryLog.filter((entry) => entry.name === 'leagueSyncQueue');
  assert.deepEqual(queueReads, [{ name: 'leagueSyncQueue', where: null, order: null, maximum: 1000 }]);
});

test('stale processing with an authoritative match converges without scoring again', async () => {
  let loads = 0;
  let settlements = 0;
  const db = createDb({
    matches: {
      'imported-700001': { _id: 'imported-700001', matchId: '700001' }
    },
    leagueSyncQueue: {
      700001: {
        _id: '700001',
        matchId: '700001',
        status: 'processing',
        processingOwner: 'crashed-owner',
        processingAt: new Date('2026-07-17T01:54:59.000Z')
      }
    }
  });
  const api = createApi(db, {
    loadPreview: async () => { loads += 1; return readyPreview('700001'); },
    settleImportedMatch: async () => { settlements += 1; }
  });

  const result = await api.processLeagueQueue(TOKEN, 1);

  assert.equal(result.processed, 1);
  assert.equal(result.imported, 1);
  assert.equal(loads, 0);
  assert.equal(settlements, 0);
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'imported');
  assert.equal(db.state.leagueSyncQueue['700001'].processingOwner, '');
});

test('stale processing without an authoritative match is reclaimed and retried', async () => {
  const claims = [];
  const db = createDb({
    leagueSyncQueue: {
      700001: {
        _id: '700001',
        matchId: '700001',
        status: 'processing',
        processingOwner: 'crashed-owner',
        processingAt: new Date('2026-07-17T01:54:59.000Z')
      }
    }
  }, {
    beforeDocumentUpdate(details) {
      if (details.name === 'leagueSyncQueue' && details.id === '700001'
        && details.data.status === 'processing') claims.push(details.data);
    }
  });
  const loaded = [];
  const settled = [];
  const api = createApi(db, {
    loadPreview: async (matchId) => { loaded.push(matchId); return readyPreview(matchId); },
    settleImportedMatch: async (preview) => { settled.push(preview.matchId); }
  });

  const result = await api.processLeagueQueue(TOKEN, 1);

  assert.equal(result.processed, 1);
  assert.equal(result.imported, 1);
  assert.deepEqual(loaded, ['700001']);
  assert.deepEqual(settled, ['700001']);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].processingOwner, 'lock-owner-a');
  assert.deepEqual(claims[0].processingAt, new Date('2026-07-17T02:00:00.000Z'));
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'imported');
});

test('a processing lease exactly five minutes old remains untouched', async () => {
  let queueWrites = 0;
  let loads = 0;
  let settlements = 0;
  const processingAt = new Date('2026-07-17T01:55:00.000Z');
  const db = createDb({
    leagueSyncQueue: {
      700001: {
        _id: '700001',
        matchId: '700001',
        status: 'processing',
        processingOwner: 'live-owner',
        processingAt
      }
    }
  }, {
    beforeDocumentUpdate(details) {
      if (details.name === 'leagueSyncQueue' && details.id === '700001') queueWrites += 1;
    }
  });
  const api = createApi(db, {
    loadPreview: async () => { loads += 1; return readyPreview('700001'); },
    settleImportedMatch: async () => { settlements += 1; }
  });

  const result = await api.processLeagueQueue(TOKEN, 1);

  assert.equal(result.processed, 0);
  assert.equal(loads, 0);
  assert.equal(settlements, 0);
  assert.equal(queueWrites, 0);
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'processing');
  assert.equal(db.state.leagueSyncQueue['700001'].processingOwner, 'live-owner');
  assert.deepEqual(db.state.leagueSyncQueue['700001'].processingAt, processingAt);
});

test('processing always settles with the literal default league id', async () => {
  const db = createDb({
    system: {
      leagueSync: { _id: 'leagueSync', enabled: true, leagueId: '99999' }
    },
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'discovered' }
    }
  });
  const metadata = [];
  const api = createApi(db, {
    settleImportedMatch: async (preview, value) => metadata.push(value)
  });

  await api.processLeagueQueue(TOKEN, 1);

  assert.deepEqual(metadata, [{ source: 'league-auto', leagueId: '20040' }]);
});

test('processing settles with league metadata stored on the queue row', async () => {
  const db = createDb({
    system: { leagueSync: { _id: 'leagueSync', enabled: true } },
    leagueSyncQueue: {
      8900989622: {
        _id: '8900989622',
        matchId: '8900989622',
        status: 'discovered',
        leagueId: '19608',
        leagueName: '斐济杯',
        discoverySource: 'seed'
      }
    }
  });
  const metadata = [];
  const api = createApi(db, {
    settleImportedMatch: async (preview, value) => metadata.push(value)
  });

  await api.processLeagueQueue(TOKEN, 1);

  assert.deepEqual(metadata, [{
    source: 'league-auto',
    leagueId: '19608',
    leagueName: '斐济杯',
    discoverySource: 'seed'
  }]);
});

test('authoritative settlement converges after the first queue completion write fails', async () => {
  let importedWriteFailed = false;
  const db = createDb({
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'discovered' }
    }
  }, {
    beforeDocumentUpdate(details) {
      if (details.name === 'leagueSyncQueue' && details.id === '700001'
        && details.data.status === 'imported' && !importedWriteFailed) {
        importedWriteFailed = true;
        throw new Error('queue completion write failed');
      }
    }
  });
  let settlements = 0;
  const api = createApi(db, {
    settleImportedMatch: async (preview) => {
      settlements += 1;
      db.state.matches = db.state.matches || {};
      db.state.matches[`imported-${preview.matchId}`] = {
        _id: `imported-${preview.matchId}`,
        matchId: preview.matchId
      };
    }
  });

  const result = await api.processLeagueQueue(TOKEN, 1);

  assert.equal(result.imported, 1);
  assert.equal(result.failed, 0);
  assert.equal(settlements, 1);
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'imported');
});

test('a claim write failure is isolated and later batch rows still run', async () => {
  let claimFailed = false;
  const db = createDb({
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'discovered' },
      700002: { _id: '700002', matchId: '700002', status: 'discovered' }
    }
  }, {
    beforeDocumentUpdate(details) {
      if (details.name === 'leagueSyncQueue' && details.id === '700001'
        && details.data.status === 'processing' && !claimFailed) {
        claimFailed = true;
        throw new Error('claim write failed');
      }
    }
  });
  const settled = [];
  const api = createApi(db, {
    settleImportedMatch: async (preview) => settled.push(preview.matchId)
  });

  const result = await api.processLeagueQueue(TOKEN, 2);

  assert.equal(result.processed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.imported, 1);
  assert.deepEqual(settled, ['700002']);
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'failed');
  assert.equal(db.state.leagueSyncQueue['700002'].status, 'imported');
});

test('processing isolates row failures, classifies previews, retries, and clamps batches to five', async () => {
  const secret = process.env.LEAGUE_SYNC_TOKEN;
  const db = createDb({ leagueSyncQueue: {} });
  ['700001', '700002', '700003', '700004', '700005', '700006'].forEach((matchId) => {
    db.state.leagueSyncQueue[matchId] = { _id: matchId, matchId, status: 'discovered', attempts: 0 };
  });
  const settled = [];
  const api = createApi(db, {
    loadPreview: async (matchId) => {
      if (matchId === '700002') {
        const preview = readyPreview(matchId);
        preview.dire = [];
        return preview;
      }
      if (matchId === '700003') {
        const error = new Error(`pending https://upstream.invalid/?key=${secret}`);
        error.code = 'MATCH_PENDING';
        throw error;
      }
      if (matchId === '700004') {
        throw new Error(`upstream exploded ${secret} with full raw details`);
      }
      return readyPreview(matchId);
    },
    settleImportedMatch: async (preview, metadata) => {
      settled.push({ matchId: preview.matchId, metadata });
    }
  });

  const result = await api.processLeagueQueue(TOKEN, 99);

  assert.deepEqual(result, {
    skipped: false,
    processed: 5,
    imported: 2,
    needsReview: 1,
    waitingData: 1,
    failed: 1
  });
  assert.deepEqual(settled.map((entry) => entry.matchId), ['700001', '700005']);
  assert.deepEqual(settled[0].metadata, { source: 'league-auto', leagueId: '20040' });
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'imported');
  assert.equal(db.state.leagueSyncQueue['700002'].status, 'needs_review');
  assert.equal(db.state.leagueSyncQueue['700002'].preview.dire.length, 0);
  assert.equal(db.state.leagueSyncQueue['700003'].status, 'waiting_data');
  assert.equal(db.state.leagueSyncQueue['700003'].attempts, 1);
  assert.equal(db.state.leagueSyncQueue['700003'].nextRetryAt.toISOString(), '2026-07-17T02:05:00.000Z');
  assert.equal(db.state.leagueSyncQueue['700004'].status, 'failed');
  assert.equal(db.state.leagueSyncQueue['700006'].status, 'discovered');
  assert.equal(JSON.stringify(db.state).includes(secret), false);
  assert.equal(JSON.stringify(db.state).includes('https://upstream.invalid'), false);
  assert.equal(db.state.system.leagueSync.lockOwner, '');
  assert.equal(db.state.system.leagueSync.runCount, 1);
  assert.equal(db.state.system.leagueSync.processedCount, 5);
  assert.equal(db.state.system.leagueSync.failedCount, 1);
});

test('finally releases only the current lock owner', async () => {
  const db = createDb({
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'discovered' }
    }
  });
  const api = createApi(db, {
    settleImportedMatch: async () => {
      db.state.system.leagueSync.lockOwner = 'replacement-owner';
      db.state.system.leagueSync.lockExpiresAt = new Date('2026-07-17T02:10:00.000Z');
    }
  });

  await api.processLeagueQueue(TOKEN, 1);

  assert.equal(db.state.system.leagueSync.lockOwner, 'replacement-owner');
});

test('administrator confirmation reuses reconciliation and never settles twice', async () => {
  const db = createDb({
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'needs_review', preview: readyPreview('700001') }
    }
  });
  let settlements = 0;
  const api = createApi(db, {
    getPlayers: async () => [{ id: 'p1' }],
    applyActualLineupToPreview: (preview) => ({ ...preview, reconciled: true }),
    settleImportedMatch: async (preview, metadata) => {
      settlements += 1;
      assert.equal(preview.reconciled, true);
      assert.deepEqual(metadata, { source: 'league-auto', leagueId: '20040', players: [{ id: 'p1' }] });
    }
  });

  await assert.rejects(api.confirmLeagueSyncMatch('player', '700001', [], []), /administrator/i);
  const first = await api.confirmLeagueSyncMatch('admin', '700001', ['p1'], ['p2']);
  const second = await api.confirmLeagueSyncMatch('admin', '700001', ['p1'], ['p2']);

  assert.equal(first.status, 'imported');
  assert.deepEqual(second, { matchId: '700001', status: 'imported', alreadyImported: true });
  assert.equal(settlements, 1);
});

test('administrator confirmation cannot settle old or missing-time previews', async () => {
  const oldPreview = readyPreview('700001');
  oldPreview.startTime = LEAGUE_SYNC_START_TIME - 1;
  const missingPreview = readyPreview('700002');
  missingPreview.startTime = 0;
  const db = createDb({
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'needs_review', preview: oldPreview },
      700002: { _id: '700002', matchId: '700002', status: 'needs_review', preview: missingPreview }
    }
  });
  let settlements = 0;
  const api = createApi(db, {
    settleImportedMatch: async () => { settlements += 1; }
  });

  const oldRow = await api.confirmLeagueSyncMatch('admin', '700001', [], []);
  const missingRow = await api.confirmLeagueSyncMatch('admin', '700002', [], []);

  assert.equal(oldRow.status, 'ignored_before_start');
  assert.equal(missingRow.status, 'waiting_data');
  assert.equal(settlements, 0);
});

test('administrator confirmation converges an authoritative match without scoring again', async () => {
  const db = createDb({
    matches: {
      'imported-700001': { _id: 'imported-700001', matchId: '700001' }
    },
    leagueSyncQueue: {
      700001: { _id: '700001', matchId: '700001', status: 'needs_review', preview: readyPreview('700001') }
    }
  });
  let settlements = 0;
  const api = createApi(db, {
    settleImportedMatch: async () => { settlements += 1; }
  });

  const row = await api.confirmLeagueSyncMatch('admin', '700001', [], []);

  assert.equal(row.status, 'imported');
  assert.equal(settlements, 0);
  assert.equal(db.state.leagueSyncQueue['700001'].status, 'imported');
});

test('bootstrap state is client-safe and includes a bounded queue only for administrators', async () => {
  const db = createDb({
    system: {
      leagueSync: {
        _id: 'leagueSync',
        leagueId: '20040',
        enabled: true,
        lockOwner: 'private-owner',
        lockExpiresAt: new Date('2026-07-17T03:00:00.000Z'),
        lastError: `raw https://upstream.invalid/state?token=${TOKEN}`
      }
    },
    leagueSyncQueue: {}
  });
  for (let index = 0; index < 25; index += 1) {
    const matchId = String(800000 + index);
    db.state.leagueSyncQueue[matchId] = {
      _id: matchId,
      matchId,
      status: index === 0 ? 'imported' : 'failed',
      error: `raw https://upstream.invalid/queue?token=${TOKEN}`,
      updatedAt: new Date(Date.UTC(2026, 6, 17, 2, index))
    };
  }
  const api = createApi(db);

  const playerState = await api.getClientLeagueSyncState('player');
  const adminState = await api.getClientLeagueSyncState('admin');

  assert.equal(playerState.pendingCount, 24);
  assert.equal('queuePreview' in playerState, false);
  assert.equal(adminState.queuePreview.length, 20);
  assert.equal('lockOwner' in adminState, false);
  assert.equal('lockExpiresAt' in adminState, false);
  assert.equal(JSON.stringify(adminState).includes('private-owner'), false);
  assert.equal(JSON.stringify(adminState).includes(TOKEN), false);
  assert.equal(JSON.stringify(adminState).includes('https://upstream.invalid'), false);
});

test('internal state and forwarded administrator checks validate token first', async () => {
  const api = createApi(createDb());

  await assert.rejects(api.getLeagueSyncStateInternal('bad-token'), /authorization/i);
  assert.throws(() => api.assertLeagueSyncAdmin('bad-token', 'player'), /authorization/i);
  assert.throws(() => api.assertLeagueSyncAdmin(TOKEN, 'player'), /administrator/i);
  assert.deepEqual(api.assertLeagueSyncAdmin(TOKEN, 'admin'), { authorized: true });
});
