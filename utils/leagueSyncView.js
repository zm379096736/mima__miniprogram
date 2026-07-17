const STATUS_TEXT = {
  ignored_before_start: '\u8d77\u7b97\u65e5\u524d\uff0c\u5df2\u5ffd\u7565',
  discovered: '等待同步',
  processing: '正在同步',
  waiting_data: '等待数据',
  needs_review: '待管理员确认',
  failed: '同步失败',
  imported: '已导入'
};

const REASON_TEXT = {
  unmatched_players: '有选手尚未关联',
  ambiguous_steam_id: 'Steam ID 关联到多张选手卡',
  duplicate_players: '阵容中存在重复选手',
  incomplete_lineup: '比赛阵容不是完整的 5 对 5'
};

const DISCOVERY_SOURCE_TEXT = {
  opendota: 'OpenDota',
  valve: 'Valve',
  seed: '已知比赛'
};

function cleanDisplayError(value) {
  const message = String(value || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/(?:at\s+)?\/?var\/\S+/gi, '')
    .replace(/\b(?:api[_-]?key|token|secret|authorization)\s*[=:]?\s*\S+/gi, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return message.slice(0, 80);
}

function dateText(value) {
  if (!value) return '尚未成功同步';
  const raw = value && value.$date ? value.$date : value;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return '尚未成功同步';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function decorateQueueRow(row) {
  const status = String(row && row.status || '');
  const preview = row && row.preview ? row.preview : null;
  return {
    ...(row || {}),
    matchId: String(row && row.matchId || ''),
    status,
    statusText: STATUS_TEXT[status] || '待处理',
    reasonText: REASON_TEXT[row && row.reviewReason] || '',
    errorText: cleanDisplayError(row && row.error),
    matchedText: preview ? `已关联 ${Number(preview.matchedCount || 0)} / 10` : '',
    leagueLabel: row && row.leagueName
      ? `${row.leagueName} · ${DISCOVERY_SOURCE_TEXT[row.discoverySource] || '自动发现'}`
      : '',
    canRetry: status === 'waiting_data' || status === 'failed',
    canReview: status === 'needs_review' && Boolean(preview)
  };
}

function buildLeagueSyncView(state = {}) {
  const queue = Array.isArray(state.queuePreview)
    ? state.queuePreview
    : (Array.isArray(state.queue) ? state.queue : []);
  const pendingCount = Math.max(0, Number(state.pendingCount || 0));
  return {
    enabled: state.enabled !== false,
    statusText: state.enabled === false ? '自动同步已暂停' : '自动同步已开启',
    toggleText: state.enabled === false ? '恢复自动同步' : '暂停自动同步',
    pendingText: `待确认 ${pendingCount} 场`,
    lastSuccessText: dateText(state.lastSuccessAt),
    errorText: cleanDisplayError(state.lastError),
    queue: queue
      .filter((row) => row && row.status === 'needs_review')
      .map(decorateQueueRow)
  };
}

function matchSourceText(match = {}) {
  if (match.source === 'league-auto' || match.lineupSource === 'league-auto') {
    return match.leagueName ? `${match.leagueName} · 自动导入` : '联赛自动导入';
  }
  if (match.imported || match.source === 'manual-import') return '比赛 ID 导入';
  return '管理员手动录入';
}

module.exports = {
  buildLeagueSyncView,
  matchSourceText,
  cleanDisplayError
};
