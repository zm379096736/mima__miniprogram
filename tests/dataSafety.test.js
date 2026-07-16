const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('bootstrap never deletes matches or resets player statistics', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');
  const bootstrapBlock = source.slice(
    source.indexOf('async function bootstrap'),
    source.indexOf('async function getRoomDoc')
  );

  assert.doesNotMatch(bootstrapBlock, /resetHistoryAndHonorsOnce/);
  assert.doesNotMatch(bootstrapBlock, /collection\('matches'\).*remove/s);
  assert.doesNotMatch(bootstrapBlock, /resetPlayerStatsData/);
});
