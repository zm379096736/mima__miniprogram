const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { resetCompetitionStats } = require('../utils/competitionReset');

test('competition reset clears match statistics and preserves player profile and pigeon count', () => {
  assert.deepEqual(resetCompetitionStats({
    id: 'p1',
    name: '选手一',
    score: 88,
    points: 12,
    matches: 9,
    wins: 6,
    mvp: 2,
    touch: 1,
    pressure: 3,
    pigeon: 4,
    steamIds: ['123'],
    preferredPositions: [1, 2]
  }), {
    id: 'p1',
    name: '选手一',
    score: 88,
    points: 0,
    matches: 0,
    wins: 0,
    mvp: 0,
    touch: 0,
    pressure: 0,
    pigeon: 4,
    steamIds: ['123'],
    preferredPositions: [1, 2]
  });
});

test('administrator panel exposes explicit competition reset control', () => {
  const view = fs.readFileSync(path.join(__dirname, '../pages/room/room.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../pages/room/room.js'), 'utf8');

  assert.match(view, /wx:if="\{\{isAdmin\}\}"[\s\S]*bindtap="resetCompetitionData"/);
  assert.match(page, /resetAllCompetitionData/);
});

test('cloud reset is administrator-only, batch based, and never called by bootstrap', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const resetBlock = source.slice(
    source.indexOf('async function resetCompetitionData'),
    source.indexOf('async function resetPigeonStatsOnce')
  );
  const bootstrapBlock = source.slice(
    source.indexOf('async function bootstrap'),
    source.indexOf('async function getRoomDoc')
  );

  assert.match(resetBlock, /assertAdmin\(openid/);
  assert.match(resetBlock, /collection\('players'\)\.where/);
  assert.match(resetBlock, /collection\('matches'\)\.where/);
  assert.doesNotMatch(bootstrapBlock, /resetCompetitionData/);
  assert.match(source, /action === 'resetCompetitionData'/);
});
