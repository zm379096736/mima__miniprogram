const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const js = fs.readFileSync(path.join(__dirname, '../pages/profile/profile.js'), 'utf8');
const wxml = fs.readFileSync(path.join(__dirname, '../pages/profile/profile.wxml'), 'utf8');

test('profile builds statistics from current player and stored matches', () => {
  assert.match(js, /buildPlayerMatchStats\(player, data\.players \|\| \[\], data\.matches \|\| \[\]\)/);
  assert.match(js, /openPersonalMatch/);
  assert.match(js, /pages\/match-detail\/match-detail/);
});

test('profile displays rank record KDA economy heroes Steam IDs and recent matches', () => {
  assert.match(wxml, /stats\.rank/);
  assert.match(wxml, /stats\.winRateText/);
  assert.match(wxml, /stats\.kdaText/);
  assert.match(wxml, /stats\.averageGpm/);
  assert.match(wxml, /stats\.averageXpm/);
  assert.match(wxml, /stats\.heroes/);
  assert.match(wxml, /stats\.steamIds/);
  assert.match(wxml, /stats\.recentMatches/);
  assert.match(wxml, /bindtap="openPersonalMatch"/);
  assert.match(wxml, /item\.heroImage/);
  assert.match(wxml, /item\.heroName/);
  assert.doesNotMatch(wxml, /英雄 \{\{item\.heroId\}\}/);
});

test('player card editor remains below personal statistics', () => {
  assert.ok(wxml.indexOf('个人内战数据') < wxml.indexOf('编辑选手卡'));
  assert.match(wxml, /open-type="chooseAvatar"/);
  assert.match(wxml, /bindtap="saveProfile"/);
});
