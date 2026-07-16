const INCOMPLETE_VALVE_MATCH = '\u0056\u0061\u006c\u0076\u0065\u0020\u6bd4\u8d5b\u6570\u636e\u4e0d\u5b8c\u6574';

function normalizeValvePlayer(player) {
  return {
    account_id: Number(player.account_id || 0),
    player_slot: Number(player.player_slot || 0),
    hero_id: Number(player.hero_id || 0),
    kills: Number(player.kills || 0),
    deaths: Number(player.deaths || 0),
    assists: Number(player.assists || 0)
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

module.exports = {
  normalizeValveMatch
};
