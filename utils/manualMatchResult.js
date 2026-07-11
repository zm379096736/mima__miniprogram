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

function buildManualMatchUpdate(room, winnerSide) {
  const side = normalizeWinnerSide(winnerSide);
  assertTeams(room);

  const loserSide = side === 'radiant' ? 'dire' : 'radiant';
  const winnerTeam = room.teams[side];
  const loserTeam = room.teams[loserSide];
  const mvp = (winnerTeam.players || [])[0] || {};
  const pressure = (loserTeam.players || [])[0] || {};

  return {
    participantIds: idsFromTeam(room.teams.radiant).concat(idsFromTeam(room.teams.dire)),
    winnerIds: idsFromTeam(winnerTeam),
    mvpId: mvp.id || '',
    pressureId: pressure.id || '',
    winnerName: side === 'radiant' ? '\u5929\u8f89' : '\u591c\u9b47',
    mvpName: mvp.name || '\u5f85\u6295\u7968'
  };
}

function buildManualMatchRecord(room, winnerSide, timestamp) {
  const time = timestamp || Date.now();
  const update = buildManualMatchUpdate(room, winnerSide);
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
    scoreGap: room.teams.scoreGap || 0,
    scoringVersion: 2
  };
}

module.exports = {
  normalizeWinnerSide,
  buildManualMatchUpdate,
  buildManualMatchRecord
};
