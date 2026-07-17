function normalizeStartTime(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeLeagueMatchRecords(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  const byId = new Map();
  rows.forEach((row) => {
    const matchId = String(row && row.match_id || '').trim();
    if (!/^\d{6,20}$/.test(matchId)) return;
    const startTime = normalizeStartTime(row.start_time === undefined ? row.startTime : row.start_time);
    const existing = byId.get(matchId);
    if (!existing || (!existing.startTime && startTime)) {
      byId.set(matchId, { matchId, startTime });
    }
  });
  return Array.from(byId.values())
    .sort((left, right) => (BigInt(left.matchId) > BigInt(right.matchId)
      ? -1
      : BigInt(left.matchId) < BigInt(right.matchId) ? 1 : 0));
}

function normalizeLeagueMatchIds(payload) {
  return normalizeLeagueMatchRecords(payload).map((row) => row.matchId);
}

function classifyPreview(preview) {
  const radiant = Array.isArray(preview && preview.radiant) ? preview.radiant : [];
  const dire = Array.isArray(preview && preview.dire) ? preview.dire : [];
  const participants = radiant.concat(dire);
  const unmatchedAccountIds = participants
    .filter((player) => !player.matched)
    .map((player) => player.accountId);

  if (radiant.length !== 5 || dire.length !== 5) {
    return { status: 'needs_review', reason: 'incomplete_lineup', unmatchedAccountIds };
  }
  if (participants.some((player) => player.ambiguous)) {
    return { status: 'needs_review', reason: 'ambiguous_steam_id', unmatchedAccountIds };
  }
  if (unmatchedAccountIds.length) {
    return { status: 'needs_review', reason: 'unmatched_players', unmatchedAccountIds };
  }
  if (participants.some((player) => !String(player.playerId || '').trim())
    || new Set(participants.map((player) => player.playerId)).size !== 10) {
    return { status: 'needs_review', reason: 'duplicate_players', unmatchedAccountIds };
  }
  return { status: 'ready', reason: '', unmatchedAccountIds: [] };
}

module.exports = { normalizeLeagueMatchRecords, normalizeLeagueMatchIds, classifyPreview };
