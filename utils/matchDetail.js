function playerName(playerId, snapshot, playerById) {
  return (snapshot && snapshot.name)
    || (playerById[playerId] && playerById[playerId].name)
    || playerId
    || '\u672a\u77e5\u9009\u624b';
}

function decoratePlayer(snapshot, playerById) {
  const playerId = snapshot.playerId || snapshot.id || '';
  return {
    ...snapshot,
    playerId,
    name: playerName(playerId, snapshot, playerById),
    kdaText: `${Number(snapshot.kills || 0)} / ${Number(snapshot.deaths || 0)} / ${Number(snapshot.assists || 0)}`,
    goldPerMin: Number(snapshot.goldPerMin || 0),
    xpPerMin: Number(snapshot.xpPerMin || 0)
  };
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
    startTimeText: startTimeText(match)
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
  buildMatchDetail
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
