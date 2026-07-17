const { LEAGUES, FIJI_SEED_MATCH_IDS } = require('./leagueConfig');

const LEAGUE_ID = LEAGUES[0].id;
const BATCH_SIZE = 3;

function authorizationError() {
  return new Error('League sync authorization failed');
}

function createLeagueSyncRunner(options) {
  const token = String(options && options.token || '');
  const getOpenid = options && options.getOpenid;
  const fetchLeagueMatches = options && options.fetchLeagueMatches;
  const callApi = options && options.callApi;

  return async function runLeagueSync(event = {}) {
    if (token.length < 32) {
      throw authorizationError();
    }
    if (typeof fetchLeagueMatches !== 'function' || typeof callApi !== 'function') {
      throw new Error('League sync dependencies are unavailable');
    }

    if (event.manual === true) {
      const operatorOpenid = typeof getOpenid === 'function' ? String(getOpenid() || '') : '';
      await callApi('assertLeagueSyncAdmin', { operatorOpenid });
    }

    const state = await callApi('getLeagueSyncStateInternal', {});
    if (!state || state.enabled === false) {
      return { skipped: true, reason: 'paused' };
    }

    for (const league of LEAGUES) {
      try {
        const payload = await fetchLeagueMatches(league.id);
        await callApi('discoverLeagueMatches', {
          payload,
          metadata: {
            leagueId: league.id,
            leagueName: league.name,
            discoverySource: 'opendota'
          }
        });
      } catch (error) {
        // Continue with the remaining discovery sources and queue processing.
      }
    }
    const fiji = LEAGUES.find((league) => league.id === '19608');
    await callApi('discoverLeagueMatches', {
      payload: FIJI_SEED_MATCH_IDS.map((matchId) => ({ match_id: matchId })),
      metadata: {
        leagueId: fiji.id,
        leagueName: fiji.name,
        discoverySource: 'seed'
      }
    });
    try {
      await callApi('discoverValveLeagueMatches', { leagueId: fiji.id });
    } catch (error) {
      // The deterministic seed and existing queue still remain processable.
    }
    return callApi('processLeagueQueue', { batchSize: BATCH_SIZE });
  };
}

module.exports = {
  LEAGUE_ID,
  BATCH_SIZE,
  createLeagueSyncRunner
};
