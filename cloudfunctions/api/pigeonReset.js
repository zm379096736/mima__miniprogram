function needsPigeonReset(room, targetVersion) {
  return Number((room && room.pigeonResetVersion) || 0) < Number(targetVersion || 0);
}

function resetPlayerPigeon(player) {
  return {
    ...player,
    pigeon: 0
  };
}

module.exports = {
  needsPigeonReset,
  resetPlayerPigeon
};
