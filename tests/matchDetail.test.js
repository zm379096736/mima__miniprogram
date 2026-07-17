const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMatchDetail } = require('../utils/matchDetail');

const players = [
  { id: 'r1', name: '天辉一号' },
  { id: 'r2', name: '天辉二号' },
  { id: 'd1', name: '夜魇一号' },
  { id: 'd2', name: '夜魇二号' }
];

test('manual match detail reconstructs both sides from participant snapshots', () => {
  const detail = buildMatchDetail({
    id: 'm1',
    winner: '夜魇',
    winnerSide: 'dire',
    participantIds: ['r1', 'r2', 'd1', 'd2'],
    winnerIds: ['d1', 'd2']
  }, players);

  assert.deepEqual(detail.radiant.map((player) => player.name), ['天辉一号', '天辉二号']);
  assert.deepEqual(detail.dire.map((player) => player.name), ['夜魇一号', '夜魇二号']);
  assert.equal(detail.imported, false);
});

test('imported match detail preserves KDA economy source and timing information', () => {
  const detail = buildMatchDetail({
    id: 'imported-1',
    imported: true,
    source: 'league-auto',
    winner: '天辉',
    duration: 3010,
    startTime: 1784200000,
    radiant: [{ playerId: 'r1', name: '天辉一号', kills: 10, deaths: 2, assists: 8, goldPerMin: 640, xpPerMin: 720 }],
    dire: [{ playerId: 'd1', name: '夜魇一号', kills: 2, deaths: 10, assists: 3 }]
  }, players);

  assert.equal(detail.radiant[0].kdaText, '10 / 2 / 8');
  assert.equal(detail.dire[0].kdaText, '2 / 10 / 3');
  assert.equal(detail.radiant[0].goldPerMin, 640);
  assert.equal(detail.radiant[0].xpPerMin, 720);
  assert.equal(detail.sourceText, '联赛自动导入');
  assert.equal(detail.durationText, '50:10');
  assert.match(detail.startTimeText, /^\d{4}-\d{2}-\d{2} /);
  assert.equal(detail.imported, true);
});

test('match detail page renders source GPM and XPM', () => {
  const view = fs.readFileSync(path.join(__dirname, '../pages/match-detail/match-detail.wxml'), 'utf8');
  assert.match(view, /detail\.sourceText/);
  assert.match(view, /detail\.durationText/);
  assert.match(view, /item\.goldPerMin/);
  assert.match(view, /item\.xpPerMin/);
});

test('history cards navigate to the match detail page', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));
  const view = fs.readFileSync(path.join(__dirname, '../pages/match/match.wxml'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '../pages/match/match.js'), 'utf8');

  assert.ok(appConfig.pages.includes('pages/match-detail/match-detail'));
  assert.match(view, /bindtap="openMatchDetail"/);
  assert.match(view, /catchtap="deleteMatch"/);
  assert.match(page, /wx\.navigateTo/);
});
