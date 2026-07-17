const crypto = require('crypto');

const DEFAULT_LEAGUE_ID = '20040';
const RETRY_DELAYS_MINUTES = [5, 15, 30, 60, 180, 360];
const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const PENDING_STATUSES = ['discovered', 'waiting_data', 'needs_review', 'processing', 'failed'];
const RETRYABLE_STATUSES = ['waiting_data', 'needs_review', 'failed'];

function authorizationError() {
  return new Error('League sync authorization failed');
}

function assertLeagueSyncToken(value) {
  const configured = String(process.env.LEAGUE_SYNC_TOKEN || '');
  const supplied = String(value || '');
  if (configured.length < 32 || configured.length !== supplied.length) {
    throw authorizationError();
  }
  const configuredBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  if (configuredBuffer.length !== suppliedBuffer.length
    || !crypto.timingSafeEqual(configuredBuffer, suppliedBuffer)) {
    throw authorizationError();
  }
  return true;
}

function nextRetryAt(attempts, now = new Date()) {
  const attempt = Math.max(1, Math.floor(Number(attempts) || 1));
  const delay = RETRY_DELAYS_MINUTES[Math.min(attempt - 1, RETRY_DELAYS_MINUTES.length - 1)];
  return new Date(new Date(now).getTime() + delay * 60 * 1000);
}

function sanitizeLeagueSyncError(error, secrets = []) {
  let message = String(error && (error.message || error.errMsg || error) || 'League sync failed');
  const configured = String(process.env.LEAGUE_SYNC_TOKEN || '');
  [configured].concat(secrets || []).filter(Boolean).forEach((secret) => {
    message = message.split(String(secret)).join('[redacted]');
  });
  message = message
    .replace(/https?:\/\/\S+/gi, '[upstream]')
    .replace(/\b(key|token|secret|authorization)=?\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return message.slice(0, 160) || 'League sync failed';
}

function defaultLeagueSyncState(now = new Date()) {
  return {
    leagueId: DEFAULT_LEAGUE_ID,
    enabled: true,
    lockOwner: '',
    lockExpiresAt: null,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: '',
    runCount: 0,
    successfulRunCount: 0,
    processedCount: 0,
    importedCount: 0,
    needsReviewCount: 0,
    waitingDataCount: 0,
    failedCount: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now)
  };
}

function clampBatchSize(value) {
  const parsed = Math.floor(Number(value) || 1);
  return Math.min(5, Math.max(1, parsed));
}

function dateValue(value) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function isEligibleQueueRow(row, now = new Date()) {
  if (!row) return false;
  if (row.status === 'discovered') return true;
  if (row.status === 'processing') {
    const processingAt = dateValue(row.processingAt);
    return processingAt > 0 && processingAt < dateValue(now) - PROCESSING_LEASE_MS;
  }
  if (row.status !== 'waiting_data' && row.status !== 'failed') return false;
  return !row.nextRetryAt || dateValue(row.nextRetryAt) <= dateValue(now);
}

function normalizePreviewPlayer(player) {
  return {
    accountId: Number(player && player.accountId || 0),
    playerId: String(player && player.playerId || ''),
    name: String(player && player.name || ''),
    matched: Boolean(player && player.matched),
    ambiguous: Boolean(player && player.ambiguous),
    playerSlot: Number(player && player.playerSlot || 0),
    heroId: Number(player && player.heroId || 0),
    kills: Number(player && player.kills || 0),
    deaths: Number(player && player.deaths || 0),
    assists: Number(player && player.assists || 0),
    goldPerMin: Number(player && player.goldPerMin || 0),
    xpPerMin: Number(player && player.xpPerMin || 0)
  };
}

function normalizeStoredPreview(preview) {
  const radiant = Array.isArray(preview && preview.radiant) ? preview.radiant.map(normalizePreviewPlayer) : [];
  const dire = Array.isArray(preview && preview.dire) ? preview.dire.map(normalizePreviewPlayer) : [];
  return {
    matchId: String(preview && preview.matchId || ''),
    radiantWin: Boolean(preview && preview.radiantWin),
    winner: String(preview && preview.winner || ''),
    duration: Number(preview && preview.duration || 0),
    startTime: Number(preview && preview.startTime || 0),
    radiantKills: Number(preview && preview.radiantKills || 0),
    direKills: Number(preview && preview.direKills || 0),
    radiant,
    dire,
    matchedCount: radiant.concat(dire).filter((player) => player.matched).length
  };
}

module.exports = {
  DEFAULT_LEAGUE_ID,
  RETRY_DELAYS_MINUTES,
  PROCESSING_LEASE_MS,
  PENDING_STATUSES,
  RETRYABLE_STATUSES,
  assertLeagueSyncToken,
  nextRetryAt,
  sanitizeLeagueSyncError,
  defaultLeagueSyncState,
  clampBatchSize,
  dateValue,
  isEligibleQueueRow,
  normalizeStoredPreview
};
