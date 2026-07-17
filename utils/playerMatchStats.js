const { sortPlayersByPoints } = require('./playerRanking');
const { normalizeSteamIds } = require('./playerProfile');
const { matchSourceText } = require('./leagueSyncView');

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value) {
  if (!value) return 0;
  const raw = value && value.$date ? value.$date : value;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function matchTimestamp(match) {
  const startTime = number(match && match.startTime);
  return startTime > 0 ? startTime * 1000 : timestamp(match && (match.createdAt || match.syncedAt));
}

function durationText(seconds) {
  const total = Math.max(0, Math.floor(number(seconds)));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

function snapshotForPlayer(match, playerId) {
  return (match && match.radiant || [])
    .concat(match && match.dire || [])
    .find((row) => String(row && (row.playerId || row.id) || '') === playerId) || { playerId };
}

function buildRecentMatches(rows) {
  return rows.map(({ match, snapshot }) => {
    const won = (match.winnerIds || []).includes(snapshot.playerId);
    return {
      id: match.id,
      matchId: match.matchId || '',
      won,
      resultText: won ? '胜利' : '失败',
      resultClass: won ? 'result-win' : 'result-loss',
      heroId: number(snapshot.heroId),
      kdaText: `${number(snapshot.kills)} / ${number(snapshot.deaths)} / ${number(snapshot.assists)}`,
      duration: number(match.duration),
      durationText: durationText(match.duration),
      sourceText: matchSourceText(match),
      time: matchTimestamp(match)
    };
  });
}

function buildHeroSummary(rows) {
  const byHero = {};
  rows.forEach(({ match, snapshot }) => {
    const heroId = number(snapshot.heroId);
    if (!heroId) return;
    if (!byHero[heroId]) byHero[heroId] = { heroId, matches: 0, wins: 0 };
    byHero[heroId].matches += 1;
    if ((match.winnerIds || []).includes(snapshot.playerId)) byHero[heroId].wins += 1;
  });
  return Object.values(byHero)
    .sort((left, right) => right.matches - left.matches || right.wins - left.wins || left.heroId - right.heroId)
    .map((hero) => ({
      ...hero,
      winRateText: `${Math.round(hero.wins * 100 / hero.matches)}%`
    }));
}

function buildPlayerMatchStats(player = {}, players = [], matches = []) {
  const playerId = String(player.id || '');
  const relevant = (matches || [])
    .filter((match) => (match.participantIds || []).includes(playerId))
    .map((match, index) => ({ match, index, time: matchTimestamp(match) }))
    .sort((left, right) => right.time - left.time || left.index - right.index)
    .map(({ match }) => ({ match, snapshot: snapshotForPlayer(match, playerId) }));
  const totals = relevant.reduce((sum, row) => ({
    kills: sum.kills + number(row.snapshot.kills),
    deaths: sum.deaths + number(row.snapshot.deaths),
    assists: sum.assists + number(row.snapshot.assists),
    gpm: sum.gpm + number(row.snapshot.goldPerMin),
    xpm: sum.xpm + number(row.snapshot.xpPerMin)
  }), { kills: 0, deaths: 0, assists: 0, gpm: 0, xpm: 0 });
  const wins = relevant.filter(({ match }) => (match.winnerIds || []).includes(playerId)).length;
  const count = relevant.length;
  const divisor = Math.max(1, count);
  const rankIndex = sortPlayersByPoints(players).findIndex((row) => row.id === playerId);
  const recentRows = relevant.slice(0, 20);

  return {
    points: number(player.points),
    rank: rankIndex >= 0 ? rankIndex + 1 : 0,
    matches: count,
    wins,
    losses: count - wins,
    winRateText: count ? `${(wins * 100 / count).toFixed(1)}%` : '0.0%',
    kdaText: ((totals.kills + totals.assists) / Math.max(1, totals.deaths)).toFixed(2),
    totals,
    averageKills: (totals.kills / divisor).toFixed(1),
    averageDeaths: (totals.deaths / divisor).toFixed(1),
    averageAssists: (totals.assists / divisor).toFixed(1),
    averageGpm: String(Math.round(totals.gpm / divisor)),
    averageXpm: String(Math.round(totals.xpm / divisor)),
    steamIds: normalizeSteamIds(player.steamIds || player.steamId || ''),
    recentMatches: buildRecentMatches(recentRows),
    heroes: buildHeroSummary(recentRows)
  };
}

module.exports = { buildPlayerMatchStats };
