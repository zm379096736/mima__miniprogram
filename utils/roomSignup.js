function isSignedUp(room, playerId) {
  return (room.signups || []).includes(playerId);
}

function joinRoom(room, playerId) {
  const signups = room.signups || [];
  if (signups.includes(playerId)) {
    return { ...room, signups };
  }
  if (signups.length >= 10) {
    throw new Error('报名人数已满');
  }
  return {
    ...room,
    signups: signups.concat(playerId),
    teams: null,
    status: '报名中'
  };
}

function leaveRoom(room, playerId) {
  return {
    ...room,
    signups: (room.signups || []).filter((id) => id !== playerId),
    teams: null,
    status: '报名中'
  };
}

module.exports = {
  joinRoom,
  leaveRoom,
  isSignedUp
};
