function normalizePlayerIds(ids) {
  return (ids || []).map((id) => String(id || '').trim()).filter(Boolean);
}

function snapshotPlayer(player) {
  return {
    playerId: player.id,
    name: player.name,
    score: Number(player.score || 0),
    avatarUrl: String(player.avatarUrl || ''),
    temporary: Boolean(player.temporary)
  };
}

function resolveActualLineup(players, radiantIds, direIds) {
  const radiantPlayerIds = normalizePlayerIds(radiantIds);
  const direPlayerIds = normalizePlayerIds(direIds);
  if (radiantPlayerIds.length !== 5 || direPlayerIds.length !== 5) {
    throw new Error('\u6bcf\u961f\u5fc5\u987b\u9009\u62e9 5 \u4f4d\u5b9e\u9645\u53c2\u8d5b\u9009\u624b');
  }

  const participantIds = radiantPlayerIds.concat(direPlayerIds);
  if (new Set(participantIds).size !== 10) {
    throw new Error('\u5b9e\u9645\u53c2\u8d5b\u9635\u5bb9\u4e0d\u80fd\u5305\u542b\u91cd\u590d\u9009\u624b');
  }

  const playerById = {};
  (players || []).forEach((player) => {
    playerById[player.id] = player;
  });
  const missingId = participantIds.find((playerId) => !playerById[playerId]);
  if (missingId) {
    throw new Error('\u6ca1\u6709\u627e\u5230\u5b9e\u9645\u53c2\u8d5b\u9009\u624b');
  }

  const radiantPlayers = radiantPlayerIds.map((playerId) => playerById[playerId]);
  const direPlayers = direPlayerIds.map((playerId) => playerById[playerId]);
  const radiantScore = radiantPlayers.reduce((total, player) => total + Number(player.score || 0), 0);
  const direScore = direPlayers.reduce((total, player) => total + Number(player.score || 0), 0);

  return {
    radiantPlayerIds,
    direPlayerIds,
    participantIds,
    radiantPlayers,
    direPlayers,
    radiant: radiantPlayers.map(snapshotPlayer),
    dire: direPlayers.map(snapshotPlayer),
    radiantScore,
    direScore,
    scoreGap: Math.abs(radiantScore - direScore)
  };
}

function applyActualLineupToPreview(preview, radiantIds, direIds, players) {
  const lineup = resolveActualLineup(players, radiantIds, direIds);
  const assign = (apiPlayers, selectedPlayers) => (apiPlayers || []).map((apiPlayer, index) => ({
    ...apiPlayer,
    ...snapshotPlayer(selectedPlayers[index]),
    matched: true,
  }));

  return {
    ...preview,
    radiant: assign(preview.radiant, lineup.radiantPlayers),
    dire: assign(preview.dire, lineup.direPlayers),
    matchedCount: 10,
    actualLineup: lineup
  };
}

module.exports = {
  normalizePlayerIds,
  snapshotPlayer,
  resolveActualLineup,
  applyActualLineupToPreview
};
