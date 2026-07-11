function honorField(honorType) {
  if (honorType === 'mvp') {
    return 'mvp';
  }
  if (honorType === 'touch') {
    return 'touch';
  }
  throw new Error('\u672a\u77e5\u7684\u6295\u7968\u7c7b\u578b');
}

function applyHonorStatVote(players, honorType, previousPlayerId, nextPlayerId) {
  const field = honorField(honorType);
  return (players || []).map((player) => {
    const next = { ...player };
    if (field === 'touch') {
      next.touch = Number(next.touch || 0);
    }
    if (previousPlayerId && previousPlayerId !== nextPlayerId && next.id === previousPlayerId) {
      next[field] = Math.max(0, Number(next[field] || 0) - 1);
    }
    if (nextPlayerId && previousPlayerId !== nextPlayerId && next.id === nextPlayerId) {
      next[field] = Number(next[field] || 0) + 1;
    }
    return next;
  });
}

module.exports = {
  honorField,
  applyHonorStatVote
};
