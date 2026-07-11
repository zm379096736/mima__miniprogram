const HONOR_TYPES = ['mvp', 'touch'];

function emptyVotes() {
  return {
    mvp: {},
    touch: {}
  };
}

function emptyHonors() {
  return {
    mvp: null,
    touch: null
  };
}

function normalizeVotes(votes) {
  return {
    ...emptyVotes(),
    ...(votes || {})
  };
}

function normalizeHonors(honors) {
  return {
    ...emptyHonors(),
    ...(honors || {})
  };
}

function getVoteOptions(room, players) {
  const ids = new Set(room && Array.isArray(room.signups) ? room.signups : []);
  if (room && room.teams) {
    (room.teams.radiant.players || []).forEach((player) => ids.add(player.id));
    (room.teams.dire.players || []).forEach((player) => ids.add(player.id));
  }
  return (players || []).filter((player) => ids.has(player.id));
}

function voteHonor(room, honorType, voterId, playerId, players) {
  if (!HONOR_TYPES.includes(honorType)) {
    throw new Error('\u672a\u77e5\u7684\u6295\u7968\u7c7b\u578b');
  }
  if (!voterId) {
    throw new Error('\u8bf7\u5148\u767b\u5f55');
  }
  const options = getVoteOptions(room, players);
  if (!options.some((player) => player.id === playerId)) {
    throw new Error('\u53ea\u80fd\u6295\u7ed9\u4eca\u65e5\u5f00 C \u9009\u624b');
  }
  const votes = normalizeVotes(room.votes);
  votes[honorType] = {
    ...(votes[honorType] || {}),
    [voterId]: playerId
  };
  return {
    ...room,
    votes,
    honors: tallyHonors(votes, players)
  };
}

function tallyOne(votesByVoter, players) {
  const counts = {};
  Object.keys(votesByVoter || {}).forEach((voterId) => {
    const playerId = votesByVoter[voterId];
    counts[playerId] = (counts[playerId] || 0) + 1;
  });
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  if (!sorted.length) {
    return null;
  }
  const player = (players || []).find((item) => item.id === sorted[0]) || { id: sorted[0], name: '\u672a\u77e5\u9009\u624b' };
  return {
    playerId: player.id,
    name: player.name,
    votes: counts[player.id]
  };
}

function tallyHonors(votes, players) {
  const normalized = normalizeVotes(votes);
  return {
    mvp: tallyOne(normalized.mvp, players),
    touch: tallyOne(normalized.touch, players)
  };
}

module.exports = {
  emptyVotes,
  emptyHonors,
  normalizeVotes,
  normalizeHonors,
  getVoteOptions,
  voteHonor,
  tallyHonors
};
