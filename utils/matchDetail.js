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
    kdaText: `${Number(snapshot.kills || 0)} / ${Number(snapshot.deaths || 0)} / ${Number(snapshot.assists || 0)}`
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
  if (imported) {
    return {
      ...match,
      imported: true,
      radiant: (match.radiant || []).map((player) => decoratePlayer(player, playerById)),
      dire: (match.dire || []).map((player) => decoratePlayer(player, playerById))
    };
  }

  if ((match.radiant || []).length || (match.dire || []).length) {
    return {
      ...match,
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
    imported: false,
    radiant: snapshotsFromIds(winnerSide === 'radiant' ? winningPlayers : losingPlayers, playerById),
    dire: snapshotsFromIds(winnerSide === 'dire' ? winningPlayers : losingPlayers, playerById)
  };
}

module.exports = {
  buildMatchDetail
};
