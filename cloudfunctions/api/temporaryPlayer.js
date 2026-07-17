function normalizeSteamIds(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,，;；]+/);
  return values
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => /^\d+$/.test(item) && list.indexOf(item) === index);
}

function steamIdsForPlayer(player) {
  return normalizeSteamIds([])
    .concat(normalizeSteamIds(player && player.steamIds))
    .concat(normalizeSteamIds(player && player.steamId))
    .filter((item, index, list) => list.indexOf(item) === index);
}

function buildTemporaryPlayer(input) {
  const steamIds = normalizeSteamIds(input && input.steamIds);
  return {
    id: String(input && input.id || '').trim(),
    openid: '',
    name: String(input && input.name || '').trim() || '\u4e34\u65f6\u9009\u624b',
    score: 80,
    points: 0,
    matches: 0,
    wins: 0,
    mvp: 0,
    touch: 0,
    pigeon: 0,
    pressure: 0,
    preferredPositions: [1, 2, 3, 4, 5],
    steamId: steamIds.join(', '),
    steamIds,
    avatarUrl: '',
    profileCompleted: true,
    temporary: true
  };
}

function findClaimableTemporaryPlayer(players, steamIds) {
  const requested = new Set(normalizeSteamIds(steamIds));
  if (!requested.size) {
    return null;
  }
  return (players || []).find((player) => (
    player
    && player.temporary
    && !player.openid
    && steamIdsForPlayer(player).some((steamId) => requested.has(steamId))
  )) || null;
}

function assertSteamIdsAvailable(players, steamIds, currentPlayerId) {
  const requested = new Set(normalizeSteamIds(steamIds));
  const owner = (players || []).find((player) => (
    player
    && player.id !== currentPlayerId
    && !player.temporary
    && steamIdsForPlayer(player).some((steamId) => requested.has(steamId))
  ));
  if (owner) {
    throw new Error('\u8fd9\u4e2a Steam ID \u5df2\u7ed1\u5b9a\u5176\u4ed6\u9009\u624b\u5361');
  }
}

module.exports = {
  normalizeSteamIds,
  steamIdsForPlayer,
  buildTemporaryPlayer,
  findClaimableTemporaryPlayer,
  assertSteamIdsAvailable
};
