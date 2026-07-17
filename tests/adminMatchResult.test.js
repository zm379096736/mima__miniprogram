const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const cloudSource = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(__dirname, '../pages/match/match.js'), 'utf8');

test('match page warns ordinary members instead of submitting a result', () => {
  assert.match(pageSource, /isAdmin:\s*false/);
  assert.match(pageSource, /isAdmin:\s*Boolean\(data\.isAdmin/);
  assert.match(pageSource, /if \(!this\.data\.isAdmin\)/);
  assert.match(pageSource, /请通知管理员核对实际参赛阵容并提交比赛结果/);
});

test('cloud manual match result action requires administrator permission', () => {
  const resultBlock = cloudSource.slice(
    cloudSource.indexOf('async function recordMatchResult'),
    cloudSource.indexOf('async function previewImportedMatch')
  );

  assert.match(resultBlock, /recordMatchResult\(openid, winnerSide, radiantPlayerIds, direPlayerIds\)/);
  assert.match(resultBlock, /assertAdmin\(openid, ['"]只有管理员可以记录比赛结果['"]\)/);
  assert.match(cloudSource, /recordMatchResult\(openid, event\.winnerSide, event\.radiantPlayerIds, event\.direPlayerIds\)/);
});

test('cloud manual result detects whether an actual lineup was submitted', () => {
  const resultBlock = cloudSource.slice(
    cloudSource.indexOf('async function recordMatchResult'),
    cloudSource.indexOf('async function recordRadiantWin')
  );

  assert.match(resultBlock, /const submitted = Array\.isArray\(radiantPlayerIds\)/);
});

test('cloud imported match confirmation requires administrator permission', () => {
  const confirmBlock = cloudSource.slice(
    cloudSource.indexOf('async function confirmImportedMatch'),
    cloudSource.indexOf('async function deleteMatchRecord')
  );

  assert.match(confirmBlock, /async function confirmImportedMatch\(openid,/);
  assert.match(confirmBlock, /assertAdmin\(openid, ['"]只有管理员可以导入比赛结果['"]\)/);
  assert.match(confirmBlock, /mergeApprovals/);
  assert.match(confirmBlock, /preflightPreview/);
  assert.match(cloudSource, /confirmImportedMatch\([\s\S]*openid,[\s\S]*event\.matchId/);
  assert.match(cloudSource, /event\.mergeApprovals \|\| \[\]/);
});

test('cloud imported confirmation delegates to centralized settlement', () => {
  const confirmBlock = cloudSource.slice(
    cloudSource.indexOf('async function confirmImportedMatch'),
    cloudSource.indexOf('async function deleteMatchRecord')
  );

  assert.match(cloudSource, /const \{ settleImportedMatch \} = require\('\.\/matchSettlement'\)/);
  assert.match(confirmBlock, /return settleImportedMatch\(reconciled, \{/);
  assert.match(confirmBlock, /source: 'manual-import'/);
  assert.match(confirmBlock, /\}, \{ db \}\);/);
});

test('cloud imported settlement uses a transaction with a narrow test fallback', () => {
  assert.doesNotMatch(cloudSource, /async function settleImportedMatch/);
});

test('cloud result actions accept ordered actual lineups', () => {
  assert.match(cloudSource, /event\.radiantPlayerIds/);
  assert.match(cloudSource, /event\.direPlayerIds/);
  assert.match(cloudSource, /resolveActualLineup/);
  assert.match(cloudSource, /applyActualLineupToPreview/);
});
