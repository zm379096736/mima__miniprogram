function sortPlayersByPoints(players) {
  return (players || []).slice().sort((a, b) => {
    const pointsGap = Number(b.points || 0) - Number(a.points || 0);
    if (pointsGap) return pointsGap;
    const winGap = Number(b.wins || 0) - Number(a.wins || 0);
    if (winGap) return winGap;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

module.exports = {
  sortPlayersByPoints
};
