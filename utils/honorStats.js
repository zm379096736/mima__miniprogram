function applyFinalHonorAwards(players, honors) {
  const winners = {
    mvp: honors && honors.mvp && honors.mvp.playerId,
    touch: honors && honors.touch && honors.touch.playerId
  };

  return (players || []).map((player) => {
    const next = { ...player };
    if (winners.mvp && next.id === winners.mvp) {
      next.mvp = Number(next.mvp || 0) + 1;
    }
    if (winners.touch && next.id === winners.touch) {
      next.touch = Number(next.touch || 0) + 1;
    }
    return next;
  });
}

module.exports = {
  applyFinalHonorAwards
};
