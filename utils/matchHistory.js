function normalizeMatchRecordId(matchId) {
  const id = String(matchId || '').trim();
  if (!id) {
    throw new Error('\u8bf7\u9009\u62e9\u8981\u5220\u9664\u7684\u6218\u7ee9');
  }
  return id;
}

function removeMatchById(matches, matchId) {
  const id = normalizeMatchRecordId(matchId);
  return (matches || []).filter((match) => match.id !== id);
}

module.exports = {
  normalizeMatchRecordId,
  removeMatchById
};
