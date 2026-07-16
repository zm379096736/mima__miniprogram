const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeValveMatch,
  loadMatchWithFallback
} = require('../cloudfunctions/api/matchSources');

function valveFixture() {
  return {
    result: {
      match_id: 7001,
      radiant_win: false,
      duration: 1800,
      start_time: 1700000000,
      game_mode: 1,
      lobby_type: 1,
      players: [
        { account_id: 6, player_slot: 128, hero_id: 16, kills: 6, deaths: 2, assists: 8 },
        { account_id: 1, player_slot: 0, hero_id: 11, kills: 1, deaths: 3, assists: 4 },
        { account_id: 2, player_slot: 1 },
        { account_id: 3, player_slot: 2 },
        { account_id: 4, player_slot: 3 },
        { account_id: 5, player_slot: 4 },
        { account_id: 7, player_slot: 129 },
        { account_id: 8, player_slot: 130 },
        { account_id: 9, player_slot: 131 },
        { account_id: 10, player_slot: 132 }
      ]
    }
  };
}

test('normalizeValveMatch unwraps result and orders players by side and slot', () => {
  const result = normalizeValveMatch(valveFixture(), '7001');

  assert.equal(result.match_id, 7001);
  assert.equal(result.radiant_win, false);
  assert.equal(result.duration, 1800);
  assert.deepEqual(
    result.players.map((player) => player.account_id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  assert.deepEqual(result.players[0], {
    account_id: 1,
    player_slot: 0,
    hero_id: 11,
    kills: 1,
    deaths: 3,
    assists: 4
  });
});

test('normalizeValveMatch rejects incomplete payloads', () => {
  assert.throws(
    () => normalizeValveMatch({ result: { match_id: 7001, players: [] } }, '7001'),
    /Valve 比赛数据不完整/
  );
});

test('normalizeValveMatch rejects a different match id', () => {
  assert.throws(
    () => normalizeValveMatch(valveFixture(), '7002'),
    /Valve 比赛数据不完整/
  );
});

test('loadMatchWithFallback does not call Valve when OpenDota succeeds', async () => {
  let valveCalls = 0;
  const openDotaMatch = {
    match_id: 7001,
    radiant_win: true,
    players: Array.from({ length: 10 }, (_, index) => ({ account_id: index + 1 }))
  };

  const result = await loadMatchWithFallback({
    matchId: '7001',
    steamApiKey: 'test-key',
    fetchOpenDota: async () => openDotaMatch,
    requestOpenDotaParse: async () => false,
    fetchValve: async () => {
      valveCalls += 1;
      return valveFixture();
    }
  });

  assert.equal(result.source, 'opendota');
  assert.equal(result.match, openDotaMatch);
  assert.equal(result.parseRequested, false);
  assert.equal(valveCalls, 0);
});

test('loadMatchWithFallback uses Valve after OpenDota failure', async () => {
  const result = await loadMatchWithFallback({
    matchId: '7001',
    steamApiKey: 'test-key',
    fetchOpenDota: async () => {
      const error = new Error('missing');
      error.statusCode = 404;
      throw error;
    },
    requestOpenDotaParse: async () => true,
    fetchValve: async () => valveFixture()
  });

  assert.equal(result.source, 'valve');
  assert.equal(result.parseRequested, true);
  assert.equal(result.match.match_id, 7001);
});

test('loadMatchWithFallback skips Valve when the server key is missing', async () => {
  await assert.rejects(
    loadMatchWithFallback({
      matchId: '7001',
      steamApiKey: '',
      fetchOpenDota: async () => {
        throw new Error('network unavailable');
      },
      requestOpenDotaParse: async () => true,
      fetchValve: async () => assert.fail('Valve should not be called')
    }),
    (error) => {
      assert.equal(error.code, 'MATCH_PENDING');
      assert.match(error.message, /比赛数据正在同步/);
      return true;
    }
  );
});

test('loadMatchWithFallback reports invalid Valve credentials without exposing the key', async () => {
  const testKey = 'private-test-key';
  await assert.rejects(
    loadMatchWithFallback({
      matchId: '7001',
      steamApiKey: testKey,
      fetchOpenDota: async () => {
        throw new Error('network unavailable');
      },
      requestOpenDotaParse: async () => false,
      fetchValve: async () => {
        const error = new Error(`upstream rejected ${testKey}`);
        error.statusCode = 403;
        throw error;
      }
    }),
    (error) => {
      assert.equal(error.code, 'VALVE_AUTH_FAILED');
      assert.match(error.message, /Valve API 密钥配置无效/);
      assert.equal(error.message.includes(testKey), false);
      return true;
    }
  );
});

test('loadMatchWithFallback reports when neither source has the match', async () => {
  await assert.rejects(
    loadMatchWithFallback({
      matchId: '7001',
      steamApiKey: 'test-key',
      fetchOpenDota: async () => {
        const error = new Error('missing');
        error.statusCode = 404;
        throw error;
      },
      requestOpenDotaParse: async () => false,
      fetchValve: async () => {
        const error = new Error('missing');
        error.statusCode = 404;
        throw error;
      }
    }),
    (error) => {
      assert.equal(error.code, 'MATCH_NOT_FOUND');
      assert.match(error.message, /OpenDota 和 Valve 都未找到/);
      return true;
    }
  );
});
