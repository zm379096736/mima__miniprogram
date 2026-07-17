const { leagueById } = require('./leagueConfig');
const { normalizeLeagueMatchRecords } = require('./leagueSyncCore');

function buildValveLeagueHistoryUrl(apiKey, leagueId, count = 100) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('Valve API key is required');
  const league = leagueById(leagueId);
  if (!league || league.id !== '19608') throw new Error('Unsupported Valve league ID');
  const matchesRequested = Math.min(100, Math.max(1, Math.floor(Number(count) || 100)));
  return 'https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/v1/'
    + `?key=${encodeURIComponent(key)}`
    + `&league_id=${encodeURIComponent(league.id)}`
    + `&matches_requested=${matchesRequested}`;
}

function normalizeValveLeagueMatches(payload) {
  const rows = payload && payload.result && Array.isArray(payload.result.matches)
    ? payload.result.matches
    : [];
  return normalizeLeagueMatchRecords(rows).map((row) => ({
    match_id: row.matchId,
    ...(row.startTime ? { start_time: row.startTime } : {})
  }));
}

module.exports = {
  buildValveLeagueHistoryUrl,
  normalizeValveLeagueMatches
};
