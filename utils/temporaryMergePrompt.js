function buildTemporaryMergeMessage(merges) {
  return (merges || []).map((merge) => {
    const ids = (merge.accountIds || []).join('、');
    return `临时选手“${merge.temporaryName || merge.temporaryPlayerId}”将合并到正式选手“${merge.targetName || merge.targetPlayerId}”（Steam ID ${ids}）。是否继续？`;
  }).join('\n');
}

function approvalsFromMerges(merges) {
  return (merges || []).map((merge) => ({
    temporaryPlayerId: String(merge.temporaryPlayerId || ''),
    targetPlayerId: String(merge.targetPlayerId || '')
  })).filter((item) => item.temporaryPlayerId && item.targetPlayerId);
}

module.exports = { buildTemporaryMergeMessage, approvalsFromMerges };
