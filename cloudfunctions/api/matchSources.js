const INCOMPLETE_VALVE_MATCH = '\u0056\u0061\u006c\u0076\u0065\u0020\u6bd4\u8d5b\u6570\u636e\u4e0d\u5b8c\u6574';

function normalizeValvePlayer(player) {
  return {
    account_id: Number(player.account_id || 0),
    player_slot: Number(player.player_slot || 0),
    hero_id: Number(player.hero_id || 0),
    kills: Number(player.kills || 0),
    deaths: Number(player.deaths || 0),
    assists: Number(player.assists || 0),
    gold_per_min: Number(player.gold_per_min || 0),
    xp_per_min: Number(player.xp_per_min || 0)
  };
}

function normalizeValveMatch(payload, expectedMatchId) {
  const match = payload && payload.result ? payload.result : payload;
  const players = match && Array.isArray(match.players) ? match.players.slice() : [];
  const matchId = String((match && match.match_id) || '');

  if (!match || matchId !== String(expectedMatchId) || players.length !== 10) {
    throw new Error(INCOMPLETE_VALVE_MATCH);
  }

  players.sort((left, right) => Number(left.player_slot || 0) - Number(right.player_slot || 0));
  const radiant = players.filter((player) => Number(player.player_slot || 0) < 128);
  const dire = players.filter((player) => Number(player.player_slot || 0) >= 128);
  if (radiant.length !== 5 || dire.length !== 5) {
    throw new Error(INCOMPLETE_VALVE_MATCH);
  }

  return {
    match_id: Number(match.match_id),
    radiant_win: Boolean(match.radiant_win),
    duration: Number(match.duration || 0),
    start_time: Number(match.start_time || 0),
    game_mode: Number(match.game_mode || 0),
    lobby_type: Number(match.lobby_type || 0),
    players: radiant.concat(dire).map(normalizeValvePlayer)
  };
}

function createSourceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function tryRequestOpenDotaParse(requestOpenDotaParse, matchId) {
  try {
    return Boolean(await requestOpenDotaParse(matchId));
  } catch (error) {
    return false;
  }
}

async function loadMatchWithFallback(options) {
  const {
    matchId,
    steamApiKey,
    fetchOpenDota,
    requestOpenDotaParse,
    fetchValve
  } = options;

  try {
    return {
      match: await fetchOpenDota(matchId),
      source: 'opendota',
      parseRequested: false
    };
  } catch (openDotaError) {
    const parsePromise = tryRequestOpenDotaParse(requestOpenDotaParse, matchId);
    const key = String(steamApiKey || '').trim();
    if (!key) {
      const parseRequested = await parsePromise;
      throw createSourceError(
        parseRequested ? 'MATCH_PENDING' : 'MATCH_NOT_FOUND',
        parseRequested
          ? '\u6bd4\u8d5b\u6570\u636e\u6b63\u5728\u540c\u6b65\uff0c\u8bf7\u8fc7\u51e0\u5206\u949f\u518d\u8bd5\uff0c\u6216\u7531\u7ba1\u7406\u5458\u624b\u52a8\u5f55\u5165'
          : '\u6682\u65f6\u65e0\u6cd5\u83b7\u53d6\u8fd9\u573a\u6bd4\u8d5b\uff0c\u8bf7\u786e\u8ba4\u6bd4\u8d5b ID\uff0c\u6216\u7531\u7ba1\u7406\u5458\u624b\u52a8\u5f55\u5165'
      );
    }

    try {
      const [parseRequested, valvePayload] = await Promise.all([
        parsePromise,
        fetchValve(matchId, key)
      ]);
      return {
        match: normalizeValveMatch(valvePayload, matchId),
        source: 'valve',
        parseRequested
      };
    } catch (valveError) {
      const parseRequested = await parsePromise;
      if (valveError && (valveError.statusCode === 401 || valveError.statusCode === 403)) {
        throw createSourceError(
          'VALVE_AUTH_FAILED',
          '\u0056\u0061\u006c\u0076\u0065\u0020\u0041\u0050\u0049\u0020\u5bc6\u94a5\u914d\u7f6e\u65e0\u6548\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u68c0\u67e5\u4e91\u51fd\u6570\u73af\u5883\u53d8\u91cf'
        );
      }
      throw createSourceError(
        parseRequested ? 'MATCH_PENDING' : 'MATCH_NOT_FOUND',
        parseRequested
          ? '\u6bd4\u8d5b\u6570\u636e\u6b63\u5728\u540c\u6b65\uff0c\u8bf7\u8fc7\u51e0\u5206\u949f\u518d\u8bd5\uff0c\u6216\u7531\u7ba1\u7406\u5458\u624b\u52a8\u5f55\u5165'
          : '\u004f\u0070\u0065\u006e\u0044\u006f\u0074\u0061\u0020\u548c\u0020\u0056\u0061\u006c\u0076\u0065\u0020\u90fd\u672a\u627e\u5230\u8fd9\u573a\u6bd4\u8d5b\uff0c\u8bf7\u786e\u8ba4\u6bd4\u8d5b ID\uff0c\u6216\u7531\u7ba1\u7406\u5458\u624b\u52a8\u5f55\u5165'
      );
    }
  }
}

module.exports = {
  normalizeValveMatch,
  loadMatchWithFallback
};
