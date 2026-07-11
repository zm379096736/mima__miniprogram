function isSignedUp(room, playerId) {
  return getSignupState(room, playerId) !== 'none';
}

function getSignupState(room, playerId) {
  if ((room.signups || []).includes(playerId)) {
    return 'signup';
  }
  if ((room.waitlist || []).includes(playerId)) {
    return 'waitlist';
  }
  return 'none';
}

function assertCanJoinRoom(player) {
  if (!player || !player.profileCompleted) {
    throw new Error('\u8bf7\u5148\u521b\u5efa\u9009\u624b\u5361');
  }
}

function joinRoom(room, playerId, player) {
  if (player) {
    assertCanJoinRoom(player);
  }
  const signups = room.signups || [];
  const waitlist = room.waitlist || [];
  if (signups.includes(playerId) || waitlist.includes(playerId)) {
    return { ...room, signups, waitlist };
  }
  if (signups.length >= 10) {
    return {
      ...room,
      signups,
      waitlist: waitlist.concat(playerId),
      teams: null,
      status: '\u5019\u8865\u4e2d'
    };
  }
  return {
    ...room,
    signups: signups.concat(playerId),
    waitlist,
    teams: null,
    status: '\u62a5\u540d\u4e2d'
  };
}

function leaveRoom(room, playerId) {
  const signups = room.signups || [];
  const waitlist = room.waitlist || [];
  const wasSignup = signups.includes(playerId);
  const nextSignups = signups.filter((id) => id !== playerId);
  let nextWaitlist = waitlist.filter((id) => id !== playerId);

  if (wasSignup && nextSignups.length < 10 && nextWaitlist.length) {
    nextSignups.push(nextWaitlist[0]);
    nextWaitlist = nextWaitlist.slice(1);
  }

  return {
    ...room,
    signups: nextSignups,
    waitlist: nextWaitlist,
    teams: null,
    status: '\u62a5\u540d\u4e2d'
  };
}

module.exports = {
  joinRoom,
  leaveRoom,
  isSignedUp,
  getSignupState,
  assertCanJoinRoom
};
