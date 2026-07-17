const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const functionRoot = path.join(__dirname, '../cloudfunctions/leagueSync');

test('league sync timer is configured for every fifteen minutes', () => {
  const config = JSON.parse(fs.readFileSync(path.join(functionRoot, 'config.json'), 'utf8'));
  assert.deepEqual(config.triggers, [{
    name: 'leagueSyncEvery15Minutes',
    type: 'timer',
    config: '0 0/15 * * * * *'
  }]);
});

test('runner discovers both leagues and the Fiji seed before processing a bounded batch', async () => {
  const { createLeagueSyncRunner } = require('../cloudfunctions/leagueSync/runner');
  const calls = [];
  const runner = createLeagueSyncRunner({
    token: 't'.repeat(32),
    getOpenid: () => '',
    fetchLeagueMatches: async (leagueId) => {
      calls.push(['fetch', leagueId]);
      return [{ match_id: 700001 }];
    },
    callApi: async (action, data) => {
      calls.push([action, data]);
      if (action === 'getLeagueSyncStateInternal') return { enabled: true };
      if (action === 'processLeagueQueue') return { imported: 1 };
      return { ok: true };
    }
  });

  const result = await runner({ TriggerName: 'leagueSyncEvery15Minutes' });

  assert.deepEqual(result, { imported: 1 });
  assert.deepEqual(calls, [
    ['getLeagueSyncStateInternal', {}],
    ['fetch', '20040'],
    ['discoverLeagueMatches', {
      payload: [{ match_id: 700001 }],
      metadata: { leagueId: '20040', leagueName: '秘马内战', discoverySource: 'opendota' }
    }],
    ['fetch', '19608'],
    ['discoverLeagueMatches', {
      payload: [{ match_id: 700001 }],
      metadata: { leagueId: '19608', leagueName: '斐济杯', discoverySource: 'opendota' }
    }],
    ['discoverLeagueMatches', {
      payload: [{ match_id: '8900989622' }],
      metadata: { leagueId: '19608', leagueName: '斐济杯', discoverySource: 'seed' }
    }],
    ['discoverValveLeagueMatches', { leagueId: '19608' }],
    ['processLeagueQueue', { batchSize: 3 }]
  ]);
});

test('Valve Fiji discovery failure still processes the existing queue', async () => {
  const { createLeagueSyncRunner } = require('../cloudfunctions/leagueSync/runner');
  const calls = [];
  const runner = createLeagueSyncRunner({
    token: 't'.repeat(32),
    getOpenid: () => '',
    fetchLeagueMatches: async () => [],
    callApi: async (action, data) => {
      calls.push([action, data]);
      if (action === 'getLeagueSyncStateInternal') return { enabled: true };
      if (action === 'discoverValveLeagueMatches') throw new Error('Valve unavailable');
      if (action === 'processLeagueQueue') return { imported: 0 };
      return {};
    }
  });

  assert.deepEqual(await runner({}), { imported: 0 });
  assert.equal(calls.at(-1)[0], 'processLeagueQueue');
});

test('one failed OpenDota league list does not block other discovery sources', async () => {
  const { createLeagueSyncRunner } = require('../cloudfunctions/leagueSync/runner');
  const calls = [];
  const runner = createLeagueSyncRunner({
    token: 't'.repeat(32),
    getOpenid: () => '',
    fetchLeagueMatches: async (leagueId) => {
      if (leagueId === '19608') throw new Error('empty upstream');
      return [{ match_id: 700001 }];
    },
    callApi: async (action, data) => {
      calls.push([action, data]);
      if (action === 'getLeagueSyncStateInternal') return { enabled: true };
      if (action === 'processLeagueQueue') return { imported: 0 };
      return { ok: true };
    }
  });

  assert.deepEqual(await runner({}), { imported: 0 });
  assert.ok(calls.some(([action, data]) => action === 'discoverLeagueMatches'
    && data.metadata.discoverySource === 'seed'));
  assert.equal(calls.at(-1)[0], 'processLeagueQueue');
});

test('manual run verifies the caller before reading or changing sync state', async () => {
  const { createLeagueSyncRunner } = require('../cloudfunctions/leagueSync/runner');
  const calls = [];
  const runner = createLeagueSyncRunner({
    token: 't'.repeat(32),
    getOpenid: () => 'admin-openid',
    fetchLeagueMatches: async () => [],
    callApi: async (action, data) => {
      calls.push([action, data]);
      if (action === 'getLeagueSyncStateInternal') return { enabled: true };
      return {};
    }
  });

  await runner({ manual: true });

  assert.deepEqual(calls[0], ['assertLeagueSyncAdmin', { operatorOpenid: 'admin-openid' }]);
  assert.equal(calls[1][0], 'getLeagueSyncStateInternal');
});

test('paused synchronization exits without requesting OpenDota', async () => {
  const { createLeagueSyncRunner } = require('../cloudfunctions/leagueSync/runner');
  let fetched = false;
  const runner = createLeagueSyncRunner({
    token: 't'.repeat(32),
    getOpenid: () => '',
    fetchLeagueMatches: async () => {
      fetched = true;
      return [];
    },
    callApi: async (action) => {
      if (action === 'getLeagueSyncStateInternal') return { enabled: false };
      throw new Error(`unexpected action ${action}`);
    }
  });

  assert.deepEqual(await runner({}), { skipped: true, reason: 'paused' });
  assert.equal(fetched, false);
});

test('runner rejects an unsafe internal token before making calls', async () => {
  const { createLeagueSyncRunner } = require('../cloudfunctions/leagueSync/runner');
  let called = false;
  const runner = createLeagueSyncRunner({
    token: 'short',
    getOpenid: () => '',
    fetchLeagueMatches: async () => [],
    callApi: async () => {
      called = true;
    }
  });

  await assert.rejects(runner({}), /authorization/i);
  assert.equal(called, false);
});

test('cloud function package includes only the existing server SDK dependency', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(functionRoot, 'package.json'), 'utf8'));
  assert.deepEqual(packageJson.dependencies, { 'wx-server-sdk': 'latest' });
});
