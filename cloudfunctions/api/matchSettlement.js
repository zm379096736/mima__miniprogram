function selectedPlayerIds(players) {
  return (players || []).map((player) => String(player && player.playerId || '').trim());
}

function buildSettlement(preview, players, metadata = {}) {
  const radiant = Array.isArray(preview && preview.radiant) ? preview.radiant : [];
  const dire = Array.isArray(preview && preview.dire) ? preview.dire : [];
  const participantIds = selectedPlayerIds(radiant).concat(selectedPlayerIds(dire));
  if (radiant.length !== 5 || dire.length !== 5 || participantIds.length !== 10
    || participantIds.some((id) => !id) || new Set(participantIds).size !== 10) {
    throw new Error('Imported match must contain 10 distinct players');
  }

  const playerById = {};
  (players || []).forEach((player) => {
    playerById[String(player && player.id || '').trim()] = player;
  });
  const winnerSide = preview.radiantWin ? 'radiant' : 'dire';
  const winnerIds = selectedPlayerIds(winnerSide === 'radiant' ? radiant : dire);
  const winnerIdSet = new Set(winnerIds);
  const playerUpdates = participantIds.map((id) => {
    const player = playerById[id];
    if (!player) {
      throw new Error('Imported match contains a player that does not exist');
    }
    const won = winnerIdSet.has(id);
    return {
      _id: player._id,
      id,
      points: Number(player.points || 0) + (won ? 2 : -1),
      matches: Number(player.matches || 0) + 1,
      wins: Number(player.wins || 0) + (won ? 1 : 0)
    };
  });
  const matchId = String(preview.matchId || '').trim();
  const source = String(metadata.source || 'manual-import');
  const leagueId = metadata.leagueId === undefined || metadata.leagueId === null
    ? ''
    : String(metadata.leagueId);
  const match = {
    id: `imported-${matchId}`,
    matchId,
    title: `Dota \u6bd4\u8d5b ${matchId}`,
    winner: preview.winner || (preview.radiantWin ? '\u5929\u8f89' : '\u591c\u9b47'),
    winnerSide,
    mvp: '\u5f85\u6295\u7968',
    scoreGap: Math.abs(Number(preview.radiantKills || 0) - Number(preview.direKills || 0)),
    scoringVersion: 3,
    imported: true,
    source,
    leagueId,
    lineupSource: source === 'league-auto' ? 'league-auto' : 'import-reconciled',
    radiantWin: Boolean(preview.radiantWin),
    duration: Number(preview.duration || 0),
    startTime: Number(preview.startTime || 0),
    radiant,
    dire,
    participantIds,
    winnerIds
  };
  return { match, playerUpdates };
}

module.exports = { buildSettlement };
