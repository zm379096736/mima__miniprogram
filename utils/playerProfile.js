const VALID_POSITIONS = [1, 2, 3, 4, 5];

function normalizeSteamIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,，;；]+/);
  const ids = [];
  raw.forEach((item) => {
    const text = String(item || '').trim();
    if (/^\d+$/.test(text) && !ids.includes(text)) {
      ids.push(text);
    }
  });
  return ids;
}

function normalizeScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < 0 || value > 150) {
    throw new Error('\u5206\u6570\u8303\u56f4\u9700\u8981\u5728 0 \u5230 150 \u4e4b\u95f4');
  }
  return Math.round(value);
}

function normalizePositions(positions) {
  const unique = Array.from(new Set((positions || []).map((position) => Number(position))));
  const valid = unique.filter((position) => VALID_POSITIONS.includes(position));
  if (!valid.length) {
    throw new Error('\u81f3\u5c11\u9009\u62e9\u4e00\u4e2a\u504f\u597d\u4f4d\u7f6e');
  }
  return valid.sort((a, b) => a - b);
}

function positionText(positions) {
  return normalizePositions(positions).map((position) => `${position}\u53f7\u4f4d`).join(' / ');
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
    const steamIds = normalizeSteamIds(form.steamIds || form.steamId || player.steamIds || player.steamId || '');
    return {
      ...player,
      name: String(form.name || player.name || '\u5fae\u4fe1\u9009\u624b').trim() || '\u5fae\u4fe1\u9009\u624b',
      score,
      preferredPositions,
      steamId: steamIds.join(', '),
      steamIds,
      avatarUrl: String(form.avatarUrl || player.avatarUrl || '').trim(),
      profileCompleted: true
    };
  });

  if (!found) {
    throw new Error('\u6ca1\u6709\u627e\u5230\u5f53\u524d\u9009\u624b');
  }

  return updated;
}

module.exports = {
  updatePlayerProfile,
  positionText,
  normalizeSteamIds,
  normalizeScore,
  normalizePositions
};
