const test = require('node:test');
const assert = require('node:assert/strict');

const {
  accountIdFromSteamId,
  normalizeSteamIds,
  buildMatchPreview,
  applyImportedMatchResult,
  importedMatchToRecord
} = require('../utils/matchImport');

test('accountIdFromSteamId accepts account id and steam64', () => {
  assert.equal(accountIdFromSteamId('12345'), 12345);
  assert.equal(accountIdFromSteamId('76561197960278073'), 12345);
});

test('normalizeSteamIds accepts multiple separators and removes duplicates', () => {
  assert.deepEqual(normalizeSteamIds('12345, 67890\n12345 76561197960278073'), ['12345', '67890', '76561197960278073']);
});

test('buildMatchPreview matches any steam id bound to a player', () => {
  const preview = buildMatchPreview({
    match_id: 7002,
    radiant_win: true,
    players: [
      { account_id: 67890, kills: 1, deaths: 0, assists: 1 },
      { account_id: 2 }, { account_id: 3 }, { account_id: 4 }, { account_id: 5 },
      { account_id: 6 }, { account_id: 7 }, { account_id: 8 }, { account_id: 9 }, { account_id: 10 }
    ]
  }, [
    { id: 'p1', name: 'Multi ID Player', steamIds: ['12345', '67890'] }
  ]);

  assert.equal(preview.matchedCount, 1);
  assert.equal(preview.radiant[0].name, 'Multi ID Player');
});

test('buildMatchPreview maps OpenDota players to local player cards', () => {
  const preview = buildMatchPreview({
    match_id: 7001,
    radiant_win: true,
    duration: 1800,
    players: [
      { account_id: 1, hero_id: 10, kills: 8, deaths: 1, assists: 12 },
      { account_id: 2, hero_id: 11, kills: 5, deaths: 2, assists: 9 },
      { account_id: 3, hero_id: 12, kills: 1, deaths: 3, assists: 14 },
      { account_id: 4, hero_id: 13, kills: 0, deaths: 4, assists: 17 },
      { account_id: 5, hero_id: 14, kills: 2, deaths: 5, assists: 10 },
      { account_id: 6, hero_id: 15, kills: 7, deaths: 6, assists: 4 },
      { account_id: 7, hero_id: 16, kills: 4, deaths: 7, assists: 6 },
      { account_id: 8, hero_id: 17, kills: 3, deaths: 8, assists: 5 },
      { account_id: 9, hero_id: 18, kills: 2, deaths: 9, assists: 3 },
      { account_id: 10, hero_id: 19, kills: 1, deaths: 10, assists: 2 }
    ]
  }, [
    { id: 'p1', name: 'Carry', steamId: '1' },
    { id: 'p6', name: 'Enemy Carry', steamId: '6' }
  ]);

  assert.equal(preview.winner, '天辉');
  assert.equal(preview.matchedCount, 2);
  assert.equal(preview.radiant[0].name, 'Carry');
  assert.equal(preview.dire[0].name, 'Enemy Carry');
});

test('applyImportedMatchResult gives winners two points and losers minus one', () => {
  const preview = {
    matchId: '7001',
    radiantWin: true,
    radiantKills: 16,
    direKills: 9,
    radiant: [{ playerId: 'p1' }],
    dire: [{ playerId: 'p2' }]
  };
  const updated = applyImportedMatchResult([
    { id: 'p1', matches: 0, wins: 0, score: 80, points: 0 },
    { id: 'p2', matches: 0, wins: 0, score: 80, points: 0 },
    { id: 'p3', matches: 0, wins: 0, score: 80, points: 0 }
  ], preview);

  assert.deepEqual(updated[0], { id: 'p1', matches: 1, wins: 1, score: 80, points: 2 });
  assert.deepEqual(updated[1], { id: 'p2', matches: 1, wins: 0, score: 80, points: -1 });
  assert.deepEqual(updated[2], { id: 'p3', matches: 0, wins: 0, score: 80, points: 0 });
  assert.equal(importedMatchToRecord(preview).scoreGap, 7);
  assert.equal(importedMatchToRecord(preview).scoringVersion, 3);
});
