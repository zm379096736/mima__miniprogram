const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const cloudSource = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

test('match page warns ordinary members instead of submitting a result', () => {
  const source = fs.readFileSync(path.join(__dirname, '../pages/match/match.js'), 'utf8');

  assert.match(source, /isAdmin:\s*false/);
  assert.match(source, /isAdmin:\s*Boolean\(data\.isAdmin/);
  assert.match(source, /if \(!this\.data\.isAdmin\)/);
  assert.match(source, /仅管理员可记录比赛结果，请通知管理员提交/);
});

test('cloud manual match result action requires administrator permission', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const resultBlock = source.slice(
    source.indexOf('async function recordMatchResult'),
    source.indexOf('async function previewImportedMatch')
  );

  assert.match(resultBlock, /recordMatchResult\(openid, winnerSide, radiantPlayerIds, direPlayerIds\)/);
  assert.match(resultBlock, /assertAdmin\(openid, ['"]只有管理员可以记录比赛结果['"]\)/);
  assert.match(source, /recordMatchResult\(openid, event\.winnerSide, event\.radiantPlayerIds, event\.direPlayerIds\)/);
});

test('cloud result actions accept ordered actual lineups', () => {
  assert.match(cloudSource, /event\.radiantPlayerIds/);
  assert.match(cloudSource, /event\.direPlayerIds/);
  assert.match(cloudSource, /resolveActualLineup/);
  assert.match(cloudSource, /applyActualLineupToPreview/);
});
