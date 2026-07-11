function uniqueIds(ids) {
  return Array.from(new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean)));
}

function applyPigeonMarks(players, pigeonIds) {
  const selected = new Set(uniqueIds(pigeonIds));
  return (players || []).map((player) => {
    if (!selected.has(player.id)) {
      return player;
    }
    return {
      ...player,
      pigeon: Number(player.pigeon || 0) + 1
    };
  });
}

module.exports = {
  uniqueIds,
  applyPigeonMarks
};
