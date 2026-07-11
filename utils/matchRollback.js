function toSet(ids) {
  return new Set((ids || []).filter(Boolean));
}

function deriveRollbackIds(match) {
  if (match && match.imported) {
    const radiant = match.radiant || [];
    const dire = match.dire || [];
    const participantIds = radiant.concat(dire).map((player) => player.playerId).filter(Boolean);
    const winnerIds = (match.radiantWin ? radiant : dire).map((player) => player.playerId).filter(Boolean);
    return {
      participantIds,
      winnerIds,
      mvpId: '',
      pressureId: ''
    };
  }

  return {
    participantIds: match && match.participantIds,
    winnerIds: match && match.winnerIds,
    mvpId: match && match.mvpId,
    pressureId: match && match.pressureId
  };
}

function rollbackMatchStats(players, match) {
  const rollback = deriveRollbackIds(match);
  const participantIds = toSet(rollback.participantIds);
  const winnerIds = toSet(rollback.winnerIds);
  const usesWinLossScoring = Number((match && match.scoringVersion) || 0) >= 2;

  return (players || []).map((player) => {
    if (!participantIds.has(player.id)) {
      return player;
    }

    const next = { ...player };
    next.matches = Math.max(0, Number(next.matches || 0) - 1);
    let score = Number(next.score || 0);

    if (winnerIds.has(next.id)) {
      next.wins = Math.max(0, Number(next.wins || 0) - 1);
      score -= 2;
    } else if (usesWinLossScoring) {
      score += 1;
    }
    if (rollback.mvpId && next.id === rollback.mvpId) {
      next.mvp = Math.max(0, Number(next.mvp || 0) - 1);
      if (!usesWinLossScoring) score -= 2;
    }
    if (rollback.pressureId && next.id === rollback.pressureId) {
      next.pressure = Math.max(0, Number(next.pressure || 0) - 1);
      if (!usesWinLossScoring) score += 2;
    }

    next.score = score;
    return next;
  });
}

module.exports = {
  deriveRollbackIds,
  rollbackMatchStats
};
