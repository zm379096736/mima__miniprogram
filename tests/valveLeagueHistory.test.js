const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildValveLeagueHistoryUrl,
  normalizeValveLeagueMatches
} = require('../cloudfunctions/api/valveLeagueHistory');

test('builds a bounded Valve league history request', () => {
  const url = buildValveLeagueHistoryUrl('a key', '19608', 100);
  assert.equal(
    url,
    'https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/v1/?key=a%20key&league_id=19608&matches_requested=100'
  );
  assert.throws(() => buildValveLeagueHistoryUrl('', '19608', 100), /key/i);
  assert.throws(() => buildValveLeagueHistoryUrl('key', '99999', 100), /league/i);
});

test('normalizes valid unique Valve match ids', () => {
  assert.deepEqual(normalizeValveLeagueMatches({
    result: {
      matches: [
        { match_id: 8900989622 },
        { match_id: '8900989622' },
        { match_id: 'bad' }
      ]
    }
  }), [{ match_id: '8900989622' }]);
  assert.deepEqual(normalizeValveLeagueMatches({ result: {} }), []);
});
