const crypto = require('crypto');
const { classifyPreview } = require('./leagueSyncCore');
const {
  DEFAULT_LEAGUE_ID,
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
} = require('./leagueSyncState');

const STATE_DOCUMENT_ID = 'leagueSync';
const LOCK_DURATION_MS = 5 * 60 * 1000;

function isMissingDocumentError(error) {
  const message = String(error && (error.errMsg || error.message || error)).toLowerCase();
  return message.includes('document.get:fail document not exists')
    || message.includes('document_not_exist')
    || message.includes('document not exists');
}

async function readDocument(reference) {
  try {
    const result = await reference.get();
    return result && result.data ? result.data : null;
  } catch (error) {
    if (isMissingDocumentError(error)) return null;
    throw error;
  }
}

function normalizeMatchId(value) {
  const matchId = String(value || '').trim();
  if (!/^\d{6,20}$/.test(matchId)) {
    throw new Error('A valid league match ID is required');
  }
  return matchId;
}

function defaultLockOwner() {
  return crypto.randomBytes(16).toString('hex');
}

function safeQueueRow(row) {
  const safe = {
    matchId: String(row && row.matchId || ''),
    status: String(row && row.status || ''),
    attempts: Number(row && row.attempts || 0),
    nextRetryAt: row && row.nextRetryAt || null,
    error: row && row.error ? sanitizeLeagueSyncError(row.error) : '',
    reviewReason: String(row && row.reviewReason || ''),
    unmatchedAccountIds: Array.isArray(row && row.unmatchedAccountIds)
      ? row.unmatchedAccountIds.map(Number)
      : [],
    updatedAt: row && row.updatedAt || null
  };
  if (row && row.preview) {
    safe.preview = normalizeStoredPreview(row.preview);
  }
  return safe;
}

function safeState(state) {
  return {
    enabled: state.enabled !== false,
    leagueId: String(state.leagueId || DEFAULT_LEAGUE_ID),
    lastRunAt: state.lastRunAt || null,
    lastSuccessAt: state.lastSuccessAt || null,
    lastError: state.lastError ? sanitizeLeagueSyncError(state.lastError) : '',
    runCount: Number(state.runCount || 0),
    successfulRunCount: Number(state.successfulRunCount || 0),
    processedCount: Number(state.processedCount || 0),
    importedCount: Number(state.importedCount || 0),
    needsReviewCount: Number(state.needsReviewCount || 0),
    waitingDataCount: Number(state.waitingDataCount || 0),
    failedCount: Number(state.failedCount || 0)
  };
}

function createLeagueSyncApi(dependencies) {
  const {
    db,
    isAdminOpenid,
    normalizeLeagueMatchIds,
    loadPreview,
    settleImportedMatch,
    applyActualLineupToPreview,
    getPlayers,
    now = () => new Date(),
    createLockOwner = defaultLockOwner
  } = dependencies;

  function assertAdministrator(openid) {
    if (!isAdminOpenid(openid)) {
      throw new Error('League sync requires an administrator');
    }
  }

  function stateReference(writer = db) {
    return writer.collection('system').doc(STATE_DOCUMENT_ID);
  }

  function queueReference(matchId, writer = db) {
    return writer.collection('leagueSyncQueue').doc(matchId);
  }

  async function ensureLeagueSyncState() {
    const reference = stateReference();
    const existing = await readDocument(reference);
    if (existing) {
      return { ...defaultLeagueSyncState(now()), ...existing };
    }
    const state = defaultLeagueSyncState(now());
    await reference.set({ data: state });
    return { ...state, _id: STATE_DOCUMENT_ID };
  }

  function assertLeagueSyncAdmin(token, operatorOpenid) {
    assertLeagueSyncToken(token);
    assertAdministrator(operatorOpenid);
    return { authorized: true };
  }

  async function getLeagueSyncStateInternal(token) {
    assertLeagueSyncToken(token);
    return safeState(await ensureLeagueSyncState());
  }

  async function discoverLeagueMatches(token, payload) {
    assertLeagueSyncToken(token);
    await ensureLeagueSyncState();
    const matchIds = normalizeLeagueMatchIds(payload);
    let inserted = 0;
    for (const matchId of matchIds) {
      const reference = queueReference(matchId);
      if (await readDocument(reference)) continue;
      const timestamp = now();
      await reference.set({
        data: {
          matchId,
          status: 'discovered',
          attempts: 0,
          error: '',
          nextRetryAt: null,
          discoveredAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        }
      });
      inserted += 1;
    }
    return { discovered: matchIds.length, inserted };
  }

  async function setLeagueSyncEnabled(openid, enabled) {
    assertAdministrator(openid);
    if (typeof enabled !== 'boolean') {
      throw new Error('League sync enabled state must be boolean');
    }
    await ensureLeagueSyncState();
    await stateReference().update({ data: { enabled, updatedAt: now() } });
    return safeState(await readDocument(stateReference()));
  }

  async function retryLeagueSyncMatch(openid, value) {
    assertAdministrator(openid);
    const matchId = normalizeMatchId(value);
    const reference = queueReference(matchId);
    const row = await readDocument(reference);
    if (!row || !RETRYABLE_STATUSES.includes(row.status)) {
      throw new Error('League sync match is not retryable');
    }
    await reference.update({
      data: {
        status: 'discovered',
        error: '',
        nextRetryAt: null,
        processingOwner: '',
        updatedAt: now()
      }
    });
    return safeQueueRow(await readDocument(reference));
  }

  async function acquireLock(owner) {
    await ensureLeagueSyncState();
    return db.runTransaction(async (transaction) => {
      const reference = stateReference(transaction);
      const state = await readDocument(reference);
      if (state && state.enabled === false) {
        return { acquired: false, reason: 'paused' };
      }
      const currentTime = now();
      if (state && state.lockOwner && dateValue(state.lockExpiresAt) > currentTime.getTime()) {
        return { acquired: false, reason: 'locked' };
      }
      const lockExpiresAt = new Date(currentTime.getTime() + LOCK_DURATION_MS);
      await reference.update({
        data: { lockOwner: owner, lockExpiresAt, updatedAt: currentTime }
      });
      return { acquired: true, state: { ...state, lockOwner: owner, lockExpiresAt } };
    });
  }

  async function releaseLock(owner) {
    await db.runTransaction(async (transaction) => {
      const reference = stateReference(transaction);
      const state = await readDocument(reference);
      if (state && state.lockOwner === owner) {
        await reference.update({
          data: { lockOwner: '', lockExpiresAt: null, updatedAt: now() }
        });
      }
    });
  }

  async function eligibleRows(batchSize) {
    const candidates = [];
    for (const status of ['discovered', 'waiting_data', 'failed']) {
      const orderField = status === 'discovered' ? 'createdAt' : 'nextRetryAt';
      const result = await db.collection('leagueSyncQueue')
        .where({ status })
        .orderBy(orderField, 'asc')
        .limit(100)
        .get();
      candidates.push(...(result.data || []));
    }
    const currentTime = now();
    return candidates
      .filter((row) => isEligibleQueueRow(row, currentTime))
      .sort((left, right) => {
        const leftTime = dateValue(left.nextRetryAt || left.discoveredAt || left.createdAt);
        const rightTime = dateValue(right.nextRetryAt || right.discoveredAt || right.createdAt);
        return leftTime - rightTime || String(left.matchId).localeCompare(String(right.matchId));
      })
      .slice(0, batchSize);
  }

  async function processQueueRow(row, owner, leagueId) {
    const matchId = normalizeMatchId(row.matchId);
    const reference = queueReference(matchId);
    await reference.update({
      data: {
        status: 'processing',
        processingOwner: owner,
        processingAt: now(),
        updatedAt: now()
      }
    });
    try {
      const preview = normalizeStoredPreview(await loadPreview(matchId));
      const classification = classifyPreview(preview);
      if (classification.status !== 'ready') {
        await reference.update({
          data: {
            status: 'needs_review',
            preview,
            reviewReason: classification.reason,
            unmatchedAccountIds: classification.unmatchedAccountIds,
            error: '',
            nextRetryAt: null,
            processingOwner: '',
            updatedAt: now()
          }
        });
        return { status: 'needs_review' };
      }

      await settleImportedMatch(preview, { source: 'league-auto', leagueId });
      await reference.update({
        data: {
          status: 'imported',
          preview,
          error: '',
          nextRetryAt: null,
          processingOwner: '',
          importedAt: now(),
          updatedAt: now()
        }
      });
      return { status: 'imported' };
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const status = error && error.code === 'MATCH_PENDING' ? 'waiting_data' : 'failed';
      const safeError = sanitizeLeagueSyncError(error);
      await reference.update({
        data: {
          status,
          attempts,
          error: safeError,
          nextRetryAt: nextRetryAt(attempts, now()),
          processingOwner: '',
          updatedAt: now()
        }
      });
      return { status, error: safeError };
    }
  }

  async function updateRunState(initialState, counts, lastError) {
    const timestamp = now();
    const data = {
      lastRunAt: timestamp,
      lastError: lastError || '',
      runCount: Number(initialState.runCount || 0) + 1,
      processedCount: Number(initialState.processedCount || 0) + counts.processed,
      importedCount: Number(initialState.importedCount || 0) + counts.imported,
      needsReviewCount: Number(initialState.needsReviewCount || 0) + counts.needsReview,
      waitingDataCount: Number(initialState.waitingDataCount || 0) + counts.waitingData,
      failedCount: Number(initialState.failedCount || 0) + counts.failed,
      updatedAt: timestamp
    };
    if (counts.failed === 0) {
      data.lastSuccessAt = timestamp;
      data.successfulRunCount = Number(initialState.successfulRunCount || 0) + 1;
    }
    await stateReference().update({ data });
  }

  async function processLeagueQueue(token, value) {
    assertLeagueSyncToken(token);
    const batchSize = clampBatchSize(value);
    const owner = createLockOwner();
    const lock = await acquireLock(owner);
    if (!lock.acquired) {
      return { skipped: true, reason: lock.reason };
    }

    const counts = {
      skipped: false,
      processed: 0,
      imported: 0,
      needsReview: 0,
      waitingData: 0,
      failed: 0
    };
    let lastError = '';
    try {
      const rows = await eligibleRows(batchSize);
      for (const row of rows) {
        const outcome = await processQueueRow(row, owner, lock.state.leagueId || DEFAULT_LEAGUE_ID);
        counts.processed += 1;
        if (outcome.status === 'imported') counts.imported += 1;
        if (outcome.status === 'needs_review') counts.needsReview += 1;
        if (outcome.status === 'waiting_data') counts.waitingData += 1;
        if (outcome.status === 'failed') counts.failed += 1;
        if (outcome.error) lastError = outcome.error;
      }
      await updateRunState(lock.state, counts, lastError);
      return counts;
    } catch (error) {
      const safeError = sanitizeLeagueSyncError(error);
      await updateRunState(lock.state, counts, safeError);
      throw error;
    } finally {
      await releaseLock(owner);
    }
  }

  async function confirmLeagueSyncMatch(openid, value, radiantPlayerIds, direPlayerIds) {
    assertAdministrator(openid);
    const matchId = normalizeMatchId(value);
    const reference = queueReference(matchId);
    const row = await readDocument(reference);
    if (!row) throw new Error('League sync match was not found');
    if (row.status === 'imported') {
      return { matchId, status: 'imported', alreadyImported: true };
    }
    if (row.status !== 'needs_review' || !row.preview) {
      throw new Error('League sync match does not have a review preview');
    }
    const players = await getPlayers();
    const reconciled = applyActualLineupToPreview(
      row.preview,
      radiantPlayerIds,
      direPlayerIds,
      players
    );
    await settleImportedMatch(reconciled, {
      source: 'league-auto',
      leagueId: DEFAULT_LEAGUE_ID,
      players
    });
    await reference.update({
      data: {
        status: 'imported',
        preview: normalizeStoredPreview(reconciled),
        error: '',
        nextRetryAt: null,
        importedAt: now(),
        updatedAt: now()
      }
    });
    return safeQueueRow(await readDocument(reference));
  }

  async function pendingCount() {
    let total = 0;
    for (const status of PENDING_STATUSES) {
      const result = await db.collection('leagueSyncQueue').where({ status }).count();
      total += Number(result.total || 0);
    }
    return total;
  }

  async function getClientLeagueSyncState(openid) {
    const state = safeState(await ensureLeagueSyncState());
    state.pendingCount = await pendingCount();
    if (isAdminOpenid(openid)) {
      const result = await db.collection('leagueSyncQueue').orderBy('updatedAt', 'desc').limit(20).get();
      state.queuePreview = (result.data || []).map(safeQueueRow);
    }
    return state;
  }

  return {
    assertLeagueSyncAdmin,
    getLeagueSyncStateInternal,
    discoverLeagueMatches,
    setLeagueSyncEnabled,
    retryLeagueSyncMatch,
    processLeagueQueue,
    confirmLeagueSyncMatch,
    getClientLeagueSyncState
  };
}

module.exports = { createLeagueSyncApi };
