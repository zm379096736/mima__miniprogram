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

test('imported match detail preserves KDA information', () => {
  const detail = buildMatchDetail({
    id: 'imported-1',
    imported: true,
    winner: '天辉',
    radiant: [{ playerId: 'r1', name: '天辉一号', kills: 10, deaths: 2, assists: 8 }],
    dire: [{ playerId: 'd1', name: '夜魇一号', kills: 2, deaths: 10, assists: 3 }]
  }, players);

  assert.equal(detail.radiant[0].kdaText, '10 / 2 / 8');
  assert.equal(detail.dire[0].kdaText, '2 / 10 / 3');
  assert.equal(detail.imported, true);
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
