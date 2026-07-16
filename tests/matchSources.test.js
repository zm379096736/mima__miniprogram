const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeValveMatch } = require('../cloudfunctions/api/matchSources');

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

module.exports = {
  valveFixture
};
