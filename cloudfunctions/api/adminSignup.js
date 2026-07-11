function removeSignupFromRoom(room, playerId) {
  const targetId = String(playerId || '').trim();
  if (!targetId) {
    throw new Error('请选择要移除的选手');
  }

  const signups = room.signups || [];
  const waitlist = room.waitlist || [];
  const wasSignup = signups.includes(targetId);
  const nextSignups = signups.filter((id) => id !== targetId);
  let nextWaitlist = waitlist.filter((id) => id !== targetId);

  if (wasSignup && nextSignups.length < 10 && nextWaitlist.length) {
    nextSignups.push(nextWaitlist[0]);
    nextWaitlist = nextWaitlist.slice(1);
  }

  return {
    ...room,
    signups: nextSignups,
    waitlist: nextWaitlist,
    teams: null,
    status: '报名中'
  };
}

module.exports = {
  removeSignupFromRoom
};
