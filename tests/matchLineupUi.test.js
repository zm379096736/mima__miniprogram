const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const js = fs.readFileSync(path.join(__dirname, '../pages/match/match.js'), 'utf8');
const wxml = fs.readFileSync(path.join(__dirname, '../pages/match/match.wxml'), 'utf8');

test('match page exposes manual actual lineup pickers for both sides', () => {
  assert.match(wxml, /actualRadiantRows/);
  assert.match(wxml, /actualDireRows/);
  assert.match(wxml, /bindchange="onActualPlayerChange"/);
  assert.match(js, /radiantPlayerIds:\s*this\.selectedIds/);
  assert.match(js, /direPlayerIds:\s*this\.selectedIds/);
});

test('import preview supports per-row reconciliation and temporary cards', () => {
  assert.match(wxml, /bindchange="onImportPlayerChange"/);
  assert.match(wxml, /bindtap="createImportedTemporaryPlayer"/);
  assert.match(wxml, /bindtap="createManualTemporaryPlayer"/);
  assert.match(js, /adminCreateTemporaryPlayer/);
  assert.match(js, /confirmImportedMatch\([\s\S]*selectedIds/);
});

test('refreshing player options preserves empty manual lineup slots', () => {
  assert.match(js, /rowPlayerIds\(rows\)/);
  assert.match(js, /this\.rowPlayerIds\(this\.data\.actualRadiantRows\)/);
  assert.match(js, /this\.rowPlayerIds\(this\.data\.actualDireRows\)/);
});
