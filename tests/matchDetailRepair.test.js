const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  needsImportedDetailRepair,
  mergeImportedMatchDetails
} = require('../cloudfunctions/api/matchDetailRepair');

function oldMatch(rows) {
  return {
    id: 'imported-8900989622',
    imported: true,
    participantIds: Array.from({ length: 10 }, (_, index) => `p${index + 1}`),
    winnerIds: Array.from({ length: 5 }, (_, index) => `p${index + 1}`),
    scoringVersion: 3,
    radiant: rows.slice(0, 5),
    dire: rows.slice(5)
  };
}

function freshPreview() {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    accountId: 100 + index,
    playerSlot: index < 5 ? index : 128 + index - 5,
    heroId: index === 0 ? 39 : index + 1,
    kills: index + 1,
    deaths: 2,
    assists: 8,
    goldPerMin: 679 - index,
    xpPerMin: 1317 - index
  }));
  return {
    duration: 3010,
    startTime: 1784200000,
    radiantKills: 47,
    direKills: 40,
    radiant: rows.slice(0, 5),
    dire: rows.slice(5)
  };
}

test('detects missing and all-zero legacy imported economy details', () => {
  const missing = oldMatch(Array.from({ length: 10 }, (_, index) => ({ playerId: `p${index + 1}` })));
  const zero = oldMatch(Array.from({ length: 10 }, (_, index) => ({
    playerId: `p${index + 1}`,
    goldPerMin: 0,
    xpPerMin: 0
  })));
  assert.equal(needsImportedDetailRepair(missing), true);
  assert.equal(needsImportedDetailRepair(zero), true);
  assert.equal(needsImportedDetailRepair({ ...zero, detailsRefreshedAt: 'done' }), false);
  assert.equal(needsImportedDetailRepair({ ...zero, imported: false }), false);
});

test('repairs API fields by slot without returning scoring fields', () => {
  const stored = oldMatch(Array.from({ length: 10 }, (_, index) => ({
    playerId: `p${index + 1}`,
    name: `Player ${index + 1}`,
    score: 80 + index,
    avatarUrl: `cloud://env/p${index + 1}.jpg`
  })));
  const patch = mergeImportedMatchDetails(stored, freshPreview(), 'opendota');

  assert.equal(patch.radiant[0].playerId, 'p1');
  assert.equal(patch.radiant[0].score, 80);
  assert.equal(patch.radiant[0].avatarUrl, 'cloud://env/p1.jpg');
  assert.equal(patch.radiant[0].heroId, 39);
  assert.equal(patch.radiant[0].goldPerMin, 679);
  assert.equal(patch.radiant[0].xpPerMin, 1317);
  assert.equal(patch.duration, 3010);
  assert.equal(patch.detailSource, 'opendota');
  assert.equal(patch.participantIds, undefined);
  assert.equal(patch.winnerIds, undefined);
  assert.equal(patch.scoringVersion, undefined);
  assert.equal(patch.points, undefined);
});

test('rejects incomplete fresh lineups instead of damaging a stored match', () => {
  const stored = oldMatch(Array.from({ length: 10 }, (_, index) => ({ playerId: `p${index + 1}` })));
  assert.throws(
    () => mergeImportedMatchDetails(stored, { radiant: [], dire: [] }, 'opendota'),
    /ten player slots/
  );
});

test('cloud repair action updates details without invoking settlement', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const start = source.indexOf('async function refreshImportedMatchDetail');
  const end = source.indexOf('async function deleteMatchRecord', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /mergeImportedMatchDetails/);
  assert.match(block, /detailsRefreshedAt/);
  assert.doesNotMatch(block, /settleImportedMatch/);
  assert.match(source, /action === 'refreshImportedMatchDetail'/);
});
