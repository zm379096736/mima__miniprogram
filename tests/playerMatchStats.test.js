const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPlayerMatchStats } = require('../utils/playerMatchStats');

test('aggregates only stored matches containing the current player', () => {
  const stats = buildPlayerMatchStats(
    { id: 'p1', points: 2, steamIds: ['1', '2'] },
    [{ id: 'p2', points: 4 }, { id: 'p1', points: 2 }],
    [
      {
        id: 'imported-1', participantIds: ['p1', 'p2'], winnerIds: ['p1'], duration: 1800,
        source: 'league-auto',
        radiant: [{ playerId: 'p1', heroId: 39, kills: 8, deaths: 2, assists: 12, goldPerMin: 600, xpPerMin: 700 }],
        dire: [{ playerId: 'p2' }]
      },
      {
        id: 'other', participantIds: ['p2'], winnerIds: ['p2'],
        radiant: [{ playerId: 'p2', kills: 99 }], dire: []
      }
    ]
  );

  assert.equal(stats.rank, 2);
  assert.equal(stats.points, 2);
  assert.equal(stats.matches, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.losses, 0);
  assert.equal(stats.winRateText, '100.0%');
  assert.equal(stats.kdaText, '10.00');
  assert.equal(stats.averageKills, '8.0');
  assert.equal(stats.averageGpm, '600');
  assert.equal(stats.averageXpm, '700');
  assert.deepEqual(stats.steamIds, ['1', '2']);
  assert.equal(stats.recentMatches[0].resultText, '胜利');
  assert.equal(stats.recentMatches[0].sourceText, '联赛自动导入');
  assert.equal(stats.recentMatches[0].heroName, '痛苦女王');
  assert.match(stats.recentMatches[0].heroImage, /queenofpain\.png$/);
  assert.deepEqual(stats.heroes, [{
    heroId: 39,
    heroName: '痛苦女王',
    heroImage: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/queenofpain.png',
    matches: 1,
    wins: 1,
    winRateText: '100%'
  }]);
});

test('zero match and missing snapshot statistics remain finite', () => {
  const empty = buildPlayerMatchStats({ id: 'p1', points: 0 }, [{ id: 'p1', points: 0 }], []);
  assert.equal(empty.matches, 0);
  assert.equal(empty.kdaText, '0.00');
  assert.equal(empty.averageDeaths, '0.0');

  const manual = buildPlayerMatchStats(
    { id: 'p1', points: -1, steamId: '123' },
    [{ id: 'p1', points: -1 }],
    [{ id: 'manual-1', participantIds: ['p1'], winnerIds: [], winner: '夜魇' }]
  );
  assert.equal(manual.matches, 1);
  assert.equal(manual.losses, 1);
  assert.equal(manual.totals.kills, 0);
  assert.equal(manual.recentMatches[0].kdaText, '0 / 0 / 0');
});

test('performance averages use only complete personal stat snapshots', () => {
  const stats = buildPlayerMatchStats(
    { id: 'p1', points: 1 },
    [{ id: 'p1', points: 1 }],
    [
      {
        id: 'manual-1', participantIds: ['p1'], winnerIds: [],
        radiant: [{ playerId: 'p1', score: 80 }], dire: []
      },
      {
        id: 'imported-1', participantIds: ['p1'], winnerIds: ['p1'],
        radiant: [{
          playerId: 'p1', heroId: 1, kills: 0, deaths: 2, assists: 8,
          goldPerMin: 400, xpPerMin: 500
        }],
        dire: []
      }
    ]
  );

  assert.equal(stats.matches, 2);
  assert.equal(stats.wins, 1);
  assert.equal(stats.losses, 1);
  assert.equal(stats.kdaText, '4.00');
  assert.equal(stats.averageKills, '0.0');
  assert.equal(stats.averageDeaths, '2.0');
  assert.equal(stats.averageAssists, '8.0');
  assert.equal(stats.averageGpm, '400');
  assert.equal(stats.averageXpm, '500');
});

test('recent matches and hero usage are limited to twenty rows', () => {
  const matches = Array.from({ length: 24 }, (_, index) => ({
    id: `m-${index}`,
    participantIds: ['p1'],
    winnerIds: index % 2 ? [] : ['p1'],
    startTime: 1000 - index,
    radiant: [{ playerId: 'p1', heroId: index < 21 ? 1 : 2 }],
    dire: []
  }));
  const stats = buildPlayerMatchStats({ id: 'p1' }, [{ id: 'p1' }], matches);

  assert.equal(stats.recentMatches.length, 20);
  assert.deepEqual(stats.heroes.map((hero) => hero.heroId), [1]);
});
