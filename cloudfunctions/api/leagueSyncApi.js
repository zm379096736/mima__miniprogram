const crypto = require('crypto');
const { classifyPreview } = require('./leagueSyncCore');
const { normalizeLeagueMetadata } = require('./leagueConfig');
const {
  DEFAULT_LEAGUE_ID,
  PENDING_STATUSES,
  RETRYABLE_STATUSES,
  assertLeagueSyncToken,
  nextRetryAt,
  sanitizeLeagueSyncError,
  defaultLeagueSyncState,
  clampBatchSize,
  classifyMatchStartTime,
  dateValue,
  isEligibleQueueRow,
  normalizeStoredPreview
} = require('./leagueSyncState');

const STATE_DOCUMENT_ID = 'leagueSync';
const LOCK_DURATION_MS = 5 * 60 * 1000;
const QUEUE_SCAN_LIMIT = 1000;

function isMissingDocumentError(error) {
  const message = String(error && (error.errMsg || error.message || error)).toLowerCase();
  return message.includes('document.get:fail document not exists')
    || message.includes('document_not_exist')
    || message.includes('document not exists')
    || /document\b.*\bdoes not exist\b/.test(message);
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
  if (row && row.leagueId) safe.leagueId = String(row.leagueId);
  if (row && row.leagueName) safe.leagueName = String(row.leagueName);
  if (row && row.discoverySource) safe.discoverySource = String(row.discoverySource);
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
    normalizeLeagueMatchRecords,
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

  function importedMatchReference(matchId, writer = db) {
    return writer.collection('matches').doc(`imported-${matchId}`);
  }

  async function hasAuthoritativeMatch(matchId, writer = db) {
    return Boolean(await readDocument(importedMatchReference(matchId, writer)));
  }

  function importedQueueData(timestamp) {
    return {
      status: 'imported',
      error: '',
      nextRetryAt: null,
      processingOwner: '',
      processingAt: null,
      importedAt: timestamp,
      updatedAt: timestamp
    };
  }

  function ignoredBeforeStartData(preview, timestamp) {
    return {
      status: 'ignored_before_start',
      error: '',
      nextRetryAt: null,
      processingOwner: '',
      processingAt: null,
      preview,
      ignoredAt: timestamp,
      updatedAt: timestamp
    };
  }

  function missingStartTimeError() {
    const error = new Error('Match start time is not available yet');
    error.code = 'MATCH_PENDING';
    return error;
  }

  async function convergeQueueInTransaction(matchId) {
    return db.runTransaction(async (transaction) => {
      if (!await hasAuthoritativeMatch(matchId, transaction)) return null;
      const data = importedQueueData(now());
      await queueReference(matchId, transaction).update({ data });
      return { status: 'imported' };
    });
  }

  async function ensureLeagueSyncState() {
    return db.runTransaction(async (transaction) => {
      const reference = stateReference(transaction);
      const existing = await readDocument(reference);
      if (existing) {
        return { ...defaultLeagueSyncState(now()), ...existing };
      }
      const state = defaultLeagueSyncState(now());
      await reference.set({ data: state });
      return { ...state, _id: STATE_DOCUMENT_ID };
    });
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

  async function discoverLeagueMatches(token, payload, metadata) {
    assertLeagueSyncToken(token);
    await ensureLeagueSyncState();
    const matches = normalizeLeagueMatchRecords(payload);
    const leagueMetadata = normalizeLeagueMetadata(metadata);
    let inserted = 0;
    for (const matchSummary of matches) {
      const matchId = matchSummary.matchId;
      inserted += await db.runTransaction(async (transaction) => {
        const reference = queueReference(matchId, transaction);
        const existing = await readDocument(reference);
        const timestamp = now();
        if (await hasAuthoritativeMatch(matchId, transaction)) {
          const data = {
            matchId,
            ...leagueMetadata,
            ...importedQueueData(timestamp)
          };
          if (existing) {
            await reference.update({ data });
            return 0;
          }
          await reference.set({ data: { ...data, createdAt: timestamp } });
          return 1;
        }

        const startDecision = classifyMatchStartTime(matchSummary.startTime);
        const canIgnoreExisting = existing
          && ['discovered', 'waiting_data', 'failed'].includes(existing.status);
        if (startDecision === 'before_start' && (!existing || canIgnoreExisting)) {
          const data = {
            matchId,
            ...leagueMetadata,
            status: 'ignored_before_start',
            startTime: matchSummary.startTime,
            error: '',
            nextRetryAt: null,
            processingOwner: '',
            processingAt: null,
            ignoredAt: timestamp,
            updatedAt: timestamp
          };
          if (existing) {
            await reference.update({ data });
            return 0;
          }
          await reference.set({ data: { ...data, discoveredAt: timestamp, createdAt: timestamp } });
          return 1;
        }

        if (existing) return 0;
        await reference.set({
          data: {
            matchId,
            ...leagueMetadata,
            status: 'discovered',
            attempts: 0,
            error: '',
            nextRetryAt: null,
            ...(matchSummary.startTime ? { startTime: matchSummary.startTime } : {}),
            discoveredAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        });
        return 1;
      });
    }
    return { discovered: matches.length, inserted };
  }

  function settlementMetadata(row, players) {
    const metadata = {
      source: 'league-auto',
      leagueId: String(row && row.leagueId || DEFAULT_LEAGUE_ID)
    };
    if (row && row.leagueName) metadata.leagueName = String(row.leagueName);
    if (row && row.discoverySource) metadata.discoverySource = String(row.discoverySource);
    if (players) metadata.players = players;
    return metadata;
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
    return db.runTransaction(async (transaction) => {
      const reference = queueReference(matchId, transaction);
      const row = await readDocument(reference);
      if (!row || !RETRYABLE_STATUSES.includes(row.status)) {
        throw new Error('League sync match is not retryable');
      }
      const timestamp = now();
      const data = await hasAuthoritativeMatch(matchId, transaction)
        ? importedQueueData(timestamp)
        : {
          status: 'discovered',
          error: '',
          nextRetryAt: null,
          processingOwner: '',
          processingAt: null,
          updatedAt: timestamp
        };
      await reference.update({ data });
      return safeQueueRow({ ...row, ...data });
    });
  }

  async function acquireLock(owner) {
    return db.runTransaction(async (transaction) => {
      const reference = stateReference(transaction);
      const state = await readDocument(reference);
      const currentTime = now();
      const lockExpiresAt = new Date(currentTime.getTime() + LOCK_DURATION_MS);
      if (!state) {
        const initialized = {
          ...defaultLeagueSyncState(currentTime),
          lockOwner: owner,
          lockExpiresAt,
          updatedAt: currentTime
        };
        await reference.set({ data: initialized });
        return { acquired: true, state: initialized };
      }
      if (state.enabled === false) {
        return { acquired: false, reason: 'paused' };
      }
      if (state.lockOwner && dateValue(state.lockExpiresAt) > currentTime.getTime()) {
        return { acquired: false, reason: 'locked' };
      }
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
    // League 20040 stays below this operational bound. One unindexed page keeps
    // every active row in the in-memory eligibility sort without composite indexes.
    const result = await db.collection('leagueSyncQueue').limit(QUEUE_SCAN_LIMIT).get();
    const currentTime = now();
    return (result.data || [])
      .filter((row) => isEligibleQueueRow(row, currentTime))
      .sort((left, right) => {
        const leftTime = dateValue(left.nextRetryAt || left.discoveredAt || left.createdAt);
        const rightTime = dateValue(right.nextRetryAt || right.discoveredAt || right.createdAt);
        return leftTime - rightTime || String(left.matchId).localeCompare(String(right.matchId));
      })
      .slice(0, batchSize);
  }

  async function processQueueRow(row, owner) {
    let matchId = '';
    let reference = null;
    try {
      matchId = normalizeMatchId(row.matchId);
      reference = queueReference(matchId);
      const existing = await convergeQueueInTransaction(matchId);
      if (existing) return existing;

      await reference.update({
        data: {
          status: 'processing',
          processingOwner: owner,
          processingAt: now(),
          updatedAt: now()
        }
      });
      const preview = normalizeStoredPreview(await loadPreview(matchId));
      const startDecision = classifyMatchStartTime(preview.startTime);
      if (startDecision === 'missing') throw missingStartTimeError();
      if (startDecision === 'before_start') {
        const data = ignoredBeforeStartData(preview, now());
        await reference.update({ data });
        return { status: data.status };
      }
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
            processingAt: null,
            updatedAt: now()
          }
        });
        return { status: 'needs_review' };
      }

      await settleImportedMatch(preview, settlementMetadata(row));
      await reference.update({
        data: {
          ...importedQueueData(now()),
          preview,
        }
      });
      return { status: 'imported' };
    } catch (error) {
      if (matchId) {
        try {
          const recovered = await convergeQueueInTransaction(matchId);
          if (recovered) return recovered;
        } catch (convergenceError) {
          // Preserve the original row error when convergence itself cannot write.
        }
      }
      const attempts = Number(row.attempts || 0) + 1;
      const status = error && error.code === 'MATCH_PENDING' ? 'waiting_data' : 'failed';
      const safeError = sanitizeLeagueSyncError(error);
      if (reference) {
        try {
          await reference.update({
            data: {
              status,
              attempts,
              error: safeError,
              nextRetryAt: nextRetryAt(attempts, now()),
              processingOwner: '',
              processingAt: null,
              updatedAt: now()
            }
          });
        } catch (writeError) {
          // The row remains eligible for a later run when even failure persistence is unavailable.
        }
      }
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
        const outcome = await processQueueRow(row, owner);
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
    const preflight = await db.runTransaction(async (transaction) => {
      const reference = queueReference(matchId, transaction);
      const row = await readDocument(reference);
      if (!row) throw new Error('League sync match was not found');
      if (await hasAuthoritativeMatch(matchId, transaction)) {
        const data = importedQueueData(now());
        await reference.update({ data });
        return { done: true, row: { ...row, ...data } };
      }
      if (row.status === 'imported') {
        return { done: true, row };
      }
      if (row.status !== 'needs_review' || !row.preview) {
        throw new Error('League sync match does not have a review preview');
      }
      return { done: false, row };
    });
    if (preflight.done) {
      return { matchId, status: 'imported', alreadyImported: true };
    }
    const row = preflight.row;
    const normalizedPreview = normalizeStoredPreview(row.preview);
    const startDecision = classifyMatchStartTime(normalizedPreview.startTime);
    if (startDecision === 'before_start') {
      const data = ignoredBeforeStartData(normalizedPreview, now());
      await queueReference(matchId).update({ data });
      return safeQueueRow({ ...row, ...data });
    }
    if (startDecision === 'missing') {
      const attempts = Number(row.attempts || 0) + 1;
      const error = missingStartTimeError();
      const data = {
        status: 'waiting_data',
        attempts,
        error: sanitizeLeagueSyncError(error),
        nextRetryAt: nextRetryAt(attempts, now()),
        processingOwner: '',
        processingAt: null,
        updatedAt: now()
      };
      await queueReference(matchId).update({ data });
      return safeQueueRow({ ...row, ...data });
    }
    const players = await getPlayers();
    const reconciled = applyActualLineupToPreview(
      row.preview,
      radiantPlayerIds,
      direPlayerIds,
      players
    );
    try {
      await settleImportedMatch(reconciled, settlementMetadata(row, players));
      await queueReference(matchId).update({
        data: {
          ...importedQueueData(now()),
          preview: normalizeStoredPreview(reconciled)
        }
      });
    } catch (error) {
      const recovered = await convergeQueueInTransaction(matchId);
      if (!recovered) throw error;
      return { matchId, status: 'imported', alreadyImported: true };
    }
    return safeQueueRow(await readDocument(queueReference(matchId)));
  }

  async function reviewCount() {
    const result = await db.collection('leagueSyncQueue')
      .where({ status: 'needs_review' })
      .count();
    return Number(result.total || 0);
  }

  async function reviewQueuePreview() {
    const result = await db.collection('leagueSyncQueue')
      .where({ status: 'needs_review' })
      .limit(100)
      .get();
    return (result.data || [])
      .sort((left, right) => dateValue(right.updatedAt) - dateValue(left.updatedAt))
      .slice(0, 20)
      .map(safeQueueRow);
  }

  async function getClientLeagueSyncState(openid) {
    const state = safeState(await ensureLeagueSyncState());
    state.pendingCount = await reviewCount();
    if (isAdminOpenid(openid)) {
      state.queuePreview = await reviewQueuePreview();
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
