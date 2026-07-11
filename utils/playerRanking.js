function sortPlayersByScore(players) {
  return (players || []).slice().sort((a, b) => {
    const scoreGap = Number(b.score || 0) - Number(a.score || 0);
    if (scoreGap) return scoreGap;
    const winGap = Number(b.wins || 0) - Number(a.wins || 0);
    if (winGap) return winGap;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

module.exports = {
  sortPlayersByScore
};
