const STEAM64_OFFSET = 76561197960265728n;

function normalizeMatchId(value) {
  const text = String(value || '').trim();
  if (!/^\d{6,20}$/.test(text)) {
    throw new Error('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u6bd4\u8d5b ID');
  }
  return text;
}

function accountIdFromSteamId(value) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const raw = BigInt(text);
  if (raw <= 4294967295n) {
    return Number(raw);
  }
  const accountId = raw - STEAM64_OFFSET;
  if (accountId < 0n || accountId > 4294967295n) {
    return null;
  }
  return Number(accountId);
}

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

function playerSteamIds(player) {
  return normalizeSteamIds([])
    .concat(normalizeSteamIds(player.steamIds || []))
    .concat(normalizeSteamIds(player.steamId || ''))
    .concat(normalizeSteamIds(player.accountId || ''))
    .concat(normalizeSteamIds(player.dotaAccountId || ''))
    .filter((id, index, list) => list.indexOf(id) === index);
}

function buildAccountMap(players) {
  const map = {};
  (players || []).forEach((player) => {
    playerSteamIds(player).forEach((steamId) => {
      const accountId = accountIdFromSteamId(steamId);
      if (accountId !== null) {
        map[String(accountId)] = player;
      }
    });
  });
  return map;
}

function decorateApiPlayer(apiPlayer, accountMap) {
  const accountId = Number(apiPlayer.account_id || 0);
  const matched = accountMap[String(accountId)];
  return {
    accountId,
    playerId: matched ? matched.id : '',
    name: matched ? matched.name : `Dota ${accountId || '\u533f\u540d'}`,
    matched: Boolean(matched),
    heroId: apiPlayer.hero_id || 0,
    kills: Number(apiPlayer.kills || 0),
    deaths: Number(apiPlayer.deaths || 0),
    assists: Number(apiPlayer.assists || 0)
  };
}

function buildMatchPreview(apiMatch, players) {
  if (!apiMatch || !Array.isArray(apiMatch.players)) {
    throw new Error('\u6bd4\u8d5b\u6570\u636e\u4e0d\u5b8c\u6574');
  }
  const accountMap = buildAccountMap(players);
  const decorated = apiMatch.players.map((player) => decorateApiPlayer(player, accountMap));
  const radiant = decorated.filter((player, index) => index < 5);
  const dire = decorated.filter((player, index) => index >= 5);
  const radiantKills = radiant.reduce((total, player) => total + player.kills, 0);
  const direKills = dire.reduce((total, player) => total + player.kills, 0);
  const radiantWin = Boolean(apiMatch.radiant_win);
  return {
    matchId: String(apiMatch.match_id || ''),
    radiantWin,
    winner: radiantWin ? '\u5929\u8f89' : '\u591c\u9b47',
    duration: Number(apiMatch.duration || 0),
    radiantKills,
    direKills,
    radiant,
    dire,
    matchedCount: decorated.filter((player) => player.matched).length
  };
}

function importedMatchToRecord(preview) {
  return {
    id: `imported-${preview.matchId}`,
    matchId: preview.matchId,
    title: `Dota \u6bd4\u8d5b ${preview.matchId}`,
    winner: preview.winner,
    mvp: '\u5f85\u6295\u7968',
    scoreGap: Math.abs(Number(preview.radiantKills || 0) - Number(preview.direKills || 0)),
    imported: true,
    radiantWin: Boolean(preview.radiantWin),
    radiant: preview.radiant,
    dire: preview.dire
  };
}

function applyImportedMatchResult(players, preview) {
  const winnerIds = new Set((preview.radiantWin ? preview.radiant : preview.dire).map((player) => player.playerId).filter(Boolean));
  const participantIds = new Set(preview.radiant.concat(preview.dire).map((player) => player.playerId).filter(Boolean));
  return (players || []).map((player) => {
    if (!participantIds.has(player.id)) {
      return player;
    }
    const next = { ...player };
    next.matches = Number(next.matches || 0) + 1;
    if (winnerIds.has(player.id)) {
      next.wins = Number(next.wins || 0) + 1;
      next.score = Number(next.score || 0) + 2;
    }
    return next;
  });
}

module.exports = {
  normalizeMatchId,
  accountIdFromSteamId,
  normalizeSteamIds,
  playerSteamIds,
  buildMatchPreview,
  importedMatchToRecord,
  applyImportedMatchResult
};
