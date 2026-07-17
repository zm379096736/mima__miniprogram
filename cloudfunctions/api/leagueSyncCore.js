function normalizeLeagueMatchIds(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return Array.from(new Set(rows
    .map((row) => String(row && row.match_id || '').trim())
    .filter((id) => /^\d{6,20}$/.test(id))))
    .sort((left, right) => (BigInt(left) > BigInt(right) ? -1 : BigInt(left) < BigInt(right) ? 1 : 0));
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
  if (new Set(participants.map((player) => player.playerId)).size !== 10) {
    return { status: 'needs_review', reason: 'duplicate_players', unmatchedAccountIds };
  }
  return { status: 'ready', reason: '', unmatchedAccountIds: [] };
}

module.exports = { normalizeLeagueMatchIds, classifyPreview };
