const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const js = fs.readFileSync(path.join(__dirname, '../pages/match/match.js'), 'utf8');
const wxml = fs.readFileSync(path.join(__dirname, '../pages/match/match.wxml'), 'utf8');
const store = fs.readFileSync(path.join(__dirname, '../utils/cloudStore.js'), 'utf8');

test('match page exposes administrator league sync controls', () => {
  assert.match(wxml, /wx:if="\{\{isAdmin\}\}"[^>]*class="section panel sync-panel"/);
  assert.match(wxml, /bindtap="runLeagueSyncNow"/);
  assert.match(wxml, /bindtap="toggleLeagueSync"/);
  assert.match(wxml, /bindtap="retryLeagueSyncMatch"/);
  assert.match(wxml, /bindtap="openLeagueReview"/);
  assert.match(wxml, /item\.leagueLabel/);
});

test('review queue supports lineup reconciliation and confirmation', () => {
  assert.match(wxml, /reviewPreview/);
  assert.match(wxml, /bindchange="onReviewPlayerChange"/);
  assert.match(wxml, /bindtap="confirmLeagueReview"/);
  assert.match(js, /confirmLeagueSyncMatch\([\s\S]*radiantPlayerIds[\s\S]*direPlayerIds/);
});

test('cloud store provides remote-only league sync actions and clears bootstrap cache', () => {
  assert.match(store, /async function runLeagueSyncNow\(\)/);
  assert.match(store, /name:\s*'leagueSync'/);
  assert.match(store, /async function setLeagueSyncEnabled\(enabled\)/);
  assert.match(store, /async function retryLeagueSyncMatch\(matchId\)/);
  assert.match(store, /async function confirmLeagueSyncMatch\(matchId, radiantPlayerIds, direPlayerIds\)/);
  assert.match(store, /自动同步需要启用云开发/);
});

test('history rows display their import source', () => {
  assert.match(wxml, /\{\{item\.sourceText\}\}/);
  assert.match(js, /matchSourceText/);
});
