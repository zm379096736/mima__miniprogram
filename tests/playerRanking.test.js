const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { sortPlayersByScore } = require('../utils/playerRanking');

test('ranking sorts by score then wins', () => {
  const players = [
    { id: 'p1', name: 'A', score: 82, wins: 2 },
    { id: 'p2', name: 'B', score: 90, wins: 1 },
    { id: 'p3', name: 'C', score: 90, wins: 3 }
  ];

  assert.deepEqual(sortPlayersByScore(players).map((player) => player.id), ['p3', 'p2', 'p1']);
  assert.deepEqual(players.map((player) => player.id), ['p1', 'p2', 'p3']);
});

test('home and ranking pages share score sorting and ranking shows score table', () => {
  const homeSource = fs.readFileSync(path.join(__dirname, '../pages/home/home.js'), 'utf8');
  const rankSource = fs.readFileSync(path.join(__dirname, '../pages/rank/rank.js'), 'utf8');
  const rankTemplate = fs.readFileSync(path.join(__dirname, '../pages/rank/rank.wxml'), 'utf8');

  assert.match(homeSource, /sortPlayersByScore/);
  assert.match(rankSource, /sortPlayersByScore/);
  assert.match(rankTemplate, />积分表</);
  assert.match(rankTemplate, /胜 \+2 · 负 -1/);
});
