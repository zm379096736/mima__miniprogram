const cloud = require('wx-server-sdk');
const { requestJson } = require('./httpJson');
const { LEAGUE_ID, createLeagueSyncRunner } = require('./runner');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const token = String(process.env.LEAGUE_SYNC_TOKEN || '');

async function callApi(action, payload = {}) {
  const response = await cloud.callFunction({
    name: 'api',
    data: { action, token, ...payload }
  });
  return response.result;
}

async function fetchLeagueMatches(leagueId) {
  return requestJson(`https://api.opendota.com/api/leagues/${encodeURIComponent(leagueId)}/matches`);
}

exports.main = createLeagueSyncRunner({
  token,
  getOpenid: () => cloud.getWXContext().OPENID,
  fetchLeagueMatches,
  callApi
});

exports.LEAGUE_ID = LEAGUE_ID;
