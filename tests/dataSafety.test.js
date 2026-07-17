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

test('match import reads the Valve key from the cloud environment without embedding a key', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

  assert.match(source, /require\('\.\/matchSources'\)/);
  assert.match(source, /loadMatchWithFallback/);
  assert.match(source, /process\.env\.STEAM_WEB_API_KEY/);
  assert.match(source, /IDOTA2Match_570\/GetMatchDetails\/v1/);
  assert.doesNotMatch(source, /[A-F0-9]{32}/);
});

test('league sync actions keep internal and caller authorization paths separate', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

  assert.match(source, /action === 'assertLeagueSyncAdmin'/);
  assert.match(source, /action === 'getLeagueSyncStateInternal'/);
  assert.match(source, /action === 'discoverLeagueMatches'/);
  assert.match(source, /action === 'processLeagueQueue'/);
  assert.match(source, /action === 'setLeagueSyncEnabled'/);
  assert.match(source, /action === 'retryLeagueSyncMatch'/);
  assert.match(source, /action === 'confirmLeagueSyncMatch'/);
  assert.match(source, /getClientLeagueSyncState\(openid\)/);
  assert.doesNotMatch(source, /return\s+process\.env\.LEAGUE_SYNC_TOKEN/);
});

test('league sync collections are created without adding a timer cloud function', () => {
  const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

  assert.match(source, /ensureCollection\('system'\)/);
  assert.match(source, /ensureCollection\('leagueSyncQueue'\)/);
  assert.equal(fs.existsSync(path.join(__dirname, '../cloudfunctions/leagueSync')), false);
});
