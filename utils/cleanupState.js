const HISTORY_RESET_VERSION = 5;

function emptyVotes() {
  return { mvp: {}, touch: {} };
}

function emptyHonors() {
  return { mvp: null, touch: null };
}

function needsHistoryReset(room) {
  return Number((room && room.cleanupVersion) || 0) < HISTORY_RESET_VERSION;
}

function resetRoomHistoryState(room) {
  return {
    ...(room || {}),
    votes: emptyVotes(),
    honors: emptyHonors(),
    cleanupVersion: HISTORY_RESET_VERSION
  };
}

function resetPlayerStats(player) {
  return {
    ...(player || {}),
    points: 0,
    matches: 0,
    wins: 0,
    mvp: 0,
    touch: 0,
    pressure: 0
  };
}

module.exports = {
  HISTORY_RESET_VERSION,
  needsHistoryReset,
  resetRoomHistoryState,
  resetPlayerStats
};
