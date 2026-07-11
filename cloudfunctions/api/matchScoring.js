function scoreAfterMatch(score, isWinner) {
  return Number(score || 0) + (isWinner ? 2 : -1);
}

function scoreAfterRollback(score, isWinner, scoringVersion) {
  if (Number(scoringVersion || 0) >= 2) {
    return Number(score || 0) + (isWinner ? -2 : 1);
  }
  return Number(score || 0) + (isWinner ? -2 : 0);
}

module.exports = {
  scoreAfterMatch,
  scoreAfterRollback
};
