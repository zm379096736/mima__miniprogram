function normalizeRoomStartTime(value) {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) {
    throw new Error('\u8bf7\u9009\u62e9\u6709\u6548\u7684\u5f00 C \u65f6\u95f4');
  }
  const parts = text.split(':').map(Number);
  const hour = parts[0];
  const minute = parts[1];
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('\u8bf7\u9009\u62e9\u6709\u6548\u7684\u5f00 C \u65f6\u95f4');
  }
  return text;
}

function updateRoomStartTime(room, startTime) {
  return {
    ...room,
    startTime: normalizeRoomStartTime(startTime),
    teams: room.teams || null
  };
}

module.exports = {
  normalizeRoomStartTime,
  updateRoomStartTime
};
