function emptyVotes() {
  return { mvp: {}, touch: {} };
}

function emptyHonors() {
  return { mvp: null, touch: null };
}

function isAdminOpenid(openid, adminOpenids) {
  return (adminOpenids || []).includes(openid);
}

function resetRoomForNewRound(room) {
  return {
    ...(room || {}),
    status: '\u62a5\u540d\u4e2d',
    signups: [],
    waitlist: [],
    teams: null,
    votes: emptyVotes(),
    honors: emptyHonors()
  };
}

module.exports = {
  isAdminOpenid,
  resetRoomForNewRound
};
