const test = require('node:test');
const assert = require('node:assert/strict');

const apiConfig = require('../cloudfunctions/api/leagueConfig');
const runnerConfig = require('../cloudfunctions/leagueSync/leagueConfig');

test('api and scheduled sync use the same supported leagues and Fiji seed', () => {
  const expectedLeagues = [
    { id: '20040', name: '秘马内战' },
    { id: '19608', name: '斐济杯' }
  ];
  assert.deepEqual(apiConfig.LEAGUES, expectedLeagues);
  assert.deepEqual(runnerConfig.LEAGUES, expectedLeagues);
  assert.deepEqual(apiConfig.FIJI_SEED_MATCH_IDS, ['8900989622']);
  assert.deepEqual(runnerConfig.FIJI_SEED_MATCH_IDS, ['8900989622']);
  assert.equal(apiConfig.leagueById('19608').name, '斐济杯');
  assert.equal(apiConfig.leagueById('99999'), null);
});
