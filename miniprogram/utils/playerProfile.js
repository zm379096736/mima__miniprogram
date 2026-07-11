const VALID_POSITIONS = [1, 2, 3, 4, 5];

function normalizeScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > 150) {
    throw new Error('分数范围需要在 0 到 150 之间');
  }
  return Math.round(value);
}

function normalizePositions(positions) {
  const unique = Array.from(new Set((positions || []).map((position) => Number(position))));
  const valid = unique.filter((position) => VALID_POSITIONS.includes(position));
  if (!valid.length) {
    throw new Error('至少选择一个偏好位置');
  }
  return valid.sort((a, b) => a - b);
}

function positionText(positions) {
  return normalizePositions(positions).map((position) => `${position}号位`).join(' / ');
}

function updatePlayerProfile(players, playerId, form) {
  let found = false;
  const score = normalizeScore(form.score);
  const preferredPositions = normalizePositions(form.preferredPositions);

  const updated = players.map((player) => {
    if (player.id !== playerId) {
      return player;
    }
    found = true;
    return {
      ...player,
      score,
      preferredPositions,
      steamId: String(form.steamId || '').trim()
    };
  });

  if (!found) {
    throw new Error('没有找到当前选手');
  }

  return updated;
}

module.exports = {
  updatePlayerProfile,
  positionText,
  normalizeScore,
  normalizePositions
};
