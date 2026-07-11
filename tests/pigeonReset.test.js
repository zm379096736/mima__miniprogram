const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { needsPigeonReset, resetPlayerPigeon } = require('../cloudfunctions/api/pigeonReset');

test('pigeon reset runs only before the target version', () => {
  assert.equal(needsPigeonReset({}, 1), true);
  assert.equal(needsPigeonReset({ pigeonResetVersion: 0 }, 1), true);
  assert.equal(needsPigeonReset({ pigeonResetVersion: 1 }, 1), false);
});

test('pigeon reset keeps all other player data', () => {
  const player = { id: 'p1', score: 88, wins: 3, mvp: 2, pigeon: 4 };

  assert.deepEqual(resetPlayerPigeon(player), {
    id: 'p1',
    score: 88,
    wins: 3,
    mvp: 2,
    pigeon: 0
  });
});

test('cloud reset uses one batch update instead of sequential player writes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const resetBlock = source.slice(
    source.indexOf('async function resetPigeonStatsOnce'),
    source.indexOf('async function voteHonor')
  );

  assert.match(resetBlock, /where\(\{ pigeon: _\.gt\(0\) \}\)\.update/);
  assert.doesNotMatch(resetBlock, /for \(const player of players\)/);
});
