const { heroById } = require('./dotaHeroes');

function playerName(playerId, snapshot, playerById) {
  return (snapshot && snapshot.name)
    || (playerById[playerId] && playerById[playerId].name)
    || playerId
    || '\u672a\u77e5\u9009\u624b';
}

function decoratePlayer(snapshot, playerById) {
  const playerId = snapshot.playerId || snapshot.id || '';
  const currentPlayer = playerById[playerId] || {};
  const goldPerMin = Number(snapshot.goldPerMin || 0);
  const xpPerMin = Number(snapshot.xpPerMin || 0);
  const hero = heroById(snapshot.heroId);
  const score = snapshot.score === undefined
    ? Number(currentPlayer.score || 0)
    : Number(snapshot.score || 0);
  return {
    ...snapshot,
    playerId,
    name: playerName(playerId, snapshot, playerById),
    score,
    avatarUrl: snapshot.avatarUrl || currentPlayer.avatarUrl || '',
    avatarSrc: snapshot.avatarSrc || currentPlayer.avatarSrc || '/images/tab.png',
    heroName: hero.name,
    heroImage: hero.imageUrl || '/images/tab.png',
    kdaText: `${Number(snapshot.kills || 0)} / ${Number(snapshot.deaths || 0)} / ${Number(snapshot.assists || 0)}`,
    goldPerMin,
    xpPerMin,
    gpmText: goldPerMin > 0 ? String(goldPerMin) : '--',
    xpmText: xpPerMin > 0 ? String(xpPerMin) : '--'
  };
}

function sideScore(match, side, playerById) {
  const stored = Number(match && match[`${side}Score`]);
  if (Number.isFinite(stored)) return stored;
  return ((match && match[side]) || []).reduce((total, snapshot) => {
    const playerId = snapshot.playerId || snapshot.id || '';
    const current = playerById[playerId] || {};
    const score = snapshot.score === undefined ? current.score : snapshot.score;
    return total + Number(score || 0);
  }, 0);
}

function needsImportedDetailRepair(match) {
  if (!match || !match.imported || match.detailsRefreshedAt) return false;
  const rows = (match.radiant || []).concat(match.dire || []);
  if (rows.length !== 10) return true;
  const missing = rows.some((row) => !Object.prototype.hasOwnProperty.call(row || {}, 'goldPerMin')
    || !Object.prototype.hasOwnProperty.call(row || {}, 'xpPerMin'));
  const allZero = rows.every((row) => Number(row && row.goldPerMin || 0) <= 0
    && Number(row && row.xpPerMin || 0) <= 0);
  return missing || allZero;
}

function snapshotsFromIds(ids, playerById) {
  return (ids || []).map((playerId) => decoratePlayer({ playerId }, playerById));
}

function buildMatchDetail(match, players) {
  const playerById = {};
  (players || []).forEach((player) => {
    playerById[player.id] = player;
  });
  const imported = Boolean(match && match.imported);
  const common = {
    sourceText: matchSourceText(match),
    durationText: durationText(match && match.duration),
    startTimeText: startTimeText(match),
    radiantScore: sideScore(match, 'radiant', playerById),
    direScore: sideScore(match, 'dire', playerById)
  };
  if (imported) {
    return {
      ...match,
      ...common,
      imported: true,
      radiant: (match.radiant || []).map((player) => decoratePlayer(player, playerById)),
      dire: (match.dire || []).map((player) => decoratePlayer(player, playerById))
    };
  }

  if ((match.radiant || []).length || (match.dire || []).length) {
    return {
      ...match,
      ...common,
      imported: false,
      radiant: (match.radiant || []).map((player) => decoratePlayer(player, playerById)),
      dire: (match.dire || []).map((player) => decoratePlayer(player, playerById))
    };
  }

  const winnerIds = new Set(match.winnerIds || []);
  const participantIds = match.participantIds || [];
  const winningPlayers = participantIds.filter((playerId) => winnerIds.has(playerId));
  const losingPlayers = participantIds.filter((playerId) => !winnerIds.has(playerId));
  const winnerSide = match.winnerSide || (match.winner === '\u591c\u9b47' ? 'dire' : 'radiant');

  return {
    ...match,
    ...common,
    imported: false,
    radiant: snapshotsFromIds(winnerSide === 'radiant' ? winningPlayers : losingPlayers, playerById),
    dire: snapshotsFromIds(winnerSide === 'dire' ? winningPlayers : losingPlayers, playerById)
  };
}

module.exports = {
  buildMatchDetail,
  needsImportedDetailRepair
};
const { matchSourceText } = require('./leagueSyncView');

function durationText(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function startTimeText(match) {
  const startTime = Number(match && match.startTime || 0);
  const raw = startTime > 0
    ? startTime * 1000
    : (match && (match.createdAt || match.syncedAt));
  const value = raw && raw.$date ? raw.$date : raw;
  const date = new Date(value || 0);
  if (!value || !Number.isFinite(date.getTime())) return '时间未记录';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
