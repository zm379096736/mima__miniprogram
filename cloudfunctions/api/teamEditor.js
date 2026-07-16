function teamScore(players) {
  return (players || []).reduce((total, player) => total + Number(player.score || 0), 0);
}

function swapTeamPlayers(teams, radiantPlayerId, direPlayerId) {
  if (!radiantPlayerId || !direPlayerId) {
    throw new Error('\u8bf7\u4ece\u5929\u8f89\u548c\u591c\u9b47\u5404\u9009\u62e9\u4e00\u540d\u9009\u624b');
  }
  if (!teams || !teams.radiant || !teams.dire) {
    throw new Error('\u8fd8\u6ca1\u6709\u5b8c\u6210\u5206\u961f');
  }

  const radiantPlayers = (teams.radiant.players || []).map((player) => ({ ...player }));
  const direPlayers = (teams.dire.players || []).map((player) => ({ ...player }));
  const radiantIndex = radiantPlayers.findIndex((player) => player.id === radiantPlayerId);
  const direIndex = direPlayers.findIndex((player) => player.id === direPlayerId);
  if (radiantIndex < 0 || direIndex < 0) {
    throw new Error('\u6ca1\u6709\u627e\u5230\u8981\u4ea4\u6362\u7684\u9009\u624b');
  }

  const radiantPlayer = radiantPlayers[radiantIndex];
  const direPlayer = direPlayers[direIndex];
  radiantPlayers[radiantIndex] = { ...direPlayer, assignedPosition: radiantPlayer.assignedPosition };
  direPlayers[direIndex] = { ...radiantPlayer, assignedPosition: direPlayer.assignedPosition };
  radiantPlayers.sort((a, b) => a.assignedPosition - b.assignedPosition);
  direPlayers.sort((a, b) => a.assignedPosition - b.assignedPosition);

  const radiantScore = teamScore(radiantPlayers);
  const direScore = teamScore(direPlayers);
  return {
    ...teams,
    radiant: { ...teams.radiant, totalScore: radiantScore, players: radiantPlayers },
    dire: { ...teams.dire, totalScore: direScore, players: direPlayers },
    scoreGap: Math.abs(radiantScore - direScore)
  };
}

module.exports = {
  swapTeamPlayers
};

