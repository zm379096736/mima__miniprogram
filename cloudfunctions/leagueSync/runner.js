const LEAGUE_ID = '20040';
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

    const payload = await fetchLeagueMatches(LEAGUE_ID);
    await callApi('discoverLeagueMatches', { payload });
    return callApi('processLeagueQueue', { batchSize: BATCH_SIZE });
  };
}

module.exports = {
  LEAGUE_ID,
  BATCH_SIZE,
  createLeagueSyncRunner
};
