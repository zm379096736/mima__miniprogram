function normalizeWinnerSide(winnerSide) {
  if (winnerSide === 'radiant' || winnerSide === 'dire') {
    return winnerSide;
  }
  throw new Error('\u672a\u77e5\u7684\u80dc\u65b9');
}

function assertTeams(room) {
  if (!room || !room.teams || !room.teams.radiant || !room.teams.dire) {
    throw new Error('\u8fd8\u6ca1\u6709\u5b8c\u6210\u5206\u961f');
  }
}

function idsFromTeam(team) {
  return ((team && team.players) || []).map((player) => player.id).filter(Boolean);
}

function snapshotTeam(team) {
  return ((team && team.players) || []).map((player) => {
    const snapshot = { playerId: player.id, name: player.name };
    if (player.assignedPosition) {
      snapshot.assignedPosition = player.assignedPosition;
    }
    if (player.score !== undefined) {
      snapshot.score = player.score;
    }
    return snapshot;
  });
}

function buildManualMatchUpdate(room, winnerSide, actualLineup) {
  const side = normalizeWinnerSide(winnerSide);
  assertTeams(room);

  if (actualLineup) {
    return {
      participantIds: actualLineup.participantIds,
      winnerIds: side === 'radiant' ? actualLineup.radiantPlayerIds : actualLineup.direPlayerIds,
      mvpId: '',
      pressureId: '',
      winnerName: side === 'radiant' ? '\u5929\u8f89' : '\u591c\u9b47',
      mvpName: '\u5f85\u6295\u7968'
    };
  }
  const winnerTeam = room.teams[side];

  return {
    participantIds: idsFromTeam(room.teams.radiant).concat(idsFromTeam(room.teams.dire)),
    winnerIds: idsFromTeam(winnerTeam),
    mvpId: '',
    pressureId: '',
    winnerName: side === 'radiant' ? '\u5929\u8f89' : '\u591c\u9b47',
    mvpName: '\u5f85\u6295\u7968'
  };
}

function buildManualMatchRecord(room, winnerSide, timestamp, actualLineup) {
  const time = timestamp || Date.now();
  const update = buildManualMatchUpdate(room, winnerSide, actualLineup);
  return {
    id: `m${time}`,
    title: `\u79d8\u9a6c\u65e5\u8d5b ${time}`,
    winner: update.winnerName,
    winnerSide: normalizeWinnerSide(winnerSide),
    mvp: update.mvpName,
    participantIds: update.participantIds,
    winnerIds: update.winnerIds,
    mvpId: update.mvpId,
    pressureId: update.pressureId,
    radiant: actualLineup ? actualLineup.radiant : snapshotTeam(room.teams.radiant),
    dire: actualLineup ? actualLineup.dire : snapshotTeam(room.teams.dire),
    scoreGap: actualLineup ? actualLineup.scoreGap : room.teams.scoreGap || 0,
    scoringVersion: 3,
    ...(actualLineup ? {
      lineupSource: 'manual-reconciled',
      plannedParticipantIds: idsFromTeam(room.teams.radiant).concat(idsFromTeam(room.teams.dire))
    } : {})
  };
}

module.exports = {
  normalizeWinnerSide,
  buildManualMatchUpdate,
  buildManualMatchRecord
};
