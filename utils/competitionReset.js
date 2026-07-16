function resetCompetitionStats(player) {
  return {
    ...(player || {}),
    points: 0,
    matches: 0,
    wins: 0,
    mvp: 0,
    touch: 0,
    pressure: 0
  };
}

module.exports = {
  resetCompetitionStats
};
