const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSettlement } = require('../cloudfunctions/api/matchSettlement');

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
      playerId: `r${index + 1}`,
      name: `Radiant ${index + 1}`,
      kills: index + 1
    })),
    dire: Array.from({ length: 5 }, (_, index) => ({
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
    points: index,
    matches: 3,
    wins: index % 2
  }));
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
    radiant: preview.radiant,
    dire: preview.dire,
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
