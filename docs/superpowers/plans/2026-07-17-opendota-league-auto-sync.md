# OpenDota League Auto Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically discover and settle OpenDota league `20040` matches every 15 minutes, route unsafe lineups to administrator review, and show complete inhouse-only player statistics on the My page.

**Architecture:** A dedicated `leagueSync` timer function lists league matches and invokes protected internal actions on the existing `api` function. The API remains the only database writer for match settlement, so manual and automatic imports share validation, scoring, idempotency, and rollback fields. Pure helpers cover discovery, Steam-ID matching, queue decisions, and personal aggregates so the risky behavior can be tested without CloudBase.

**Tech Stack:** Native WeChat Mini Program, JavaScript CommonJS, `wx-server-sdk`, CloudBase database and timer triggers, OpenDota HTTP API, Node.js built-in test runner.

## Global Constraints

- League ID is `20040`.
- Scheduled synchronization runs every 15 minutes and administrators retain an Immediate Sync action.
- Winners receive 2 points and losers receive -1 point; self-rating remains separate.
- Automatic settlement requires exactly ten unique player-card matches, five per side.
- Unknown, duplicate, incomplete, or ambiguous participants never change points automatically.
- Personal statistics use only matches stored by this mini program.
- Manual match-ID import, manual result entry, actual-lineup reconciliation, temporary cards, and deletion rollback remain available.
- Existing untracked `assets/` files are outside this feature and must not be added to feature commits.

---

## File Structure

- Create `cloudfunctions/api/leagueSyncCore.js`: pure league-list normalization, participant classification, queue status, and retry policy.
- Create `cloudfunctions/api/matchSettlement.js`: pure validation and player update descriptors shared by manual and automatic settlement paths.
- Modify `cloudfunctions/api/matchSources.js`: preserve GPM, XPM, player slot, start time, and other detail fields from Valve fallback.
- Modify `cloudfunctions/api/index.js`: queue persistence, protected internal sync actions, common settlement transaction, bootstrap sync status, and review confirmation.
- Create `cloudfunctions/leagueSync/index.js`: scheduled discovery and bounded API dispatch.
- Create `cloudfunctions/leagueSync/config.json`: 15-minute timer trigger.
- Create `cloudfunctions/leagueSync/package.json`: cloud dependencies.
- Create `utils/leagueSyncView.js`: client formatting for sync status and review rows.
- Modify `utils/cloudStore.js`: immediate sync, pause/resume, retry, and review API methods.
- Modify `pages/match/match.js`, `pages/match/match.wxml`, and `pages/match/match.wxss`: administrator sync panel and queue workflow.
- Create `utils/playerMatchStats.js`: personal inhouse aggregates and recent-match projection.
- Modify `utils/matchImport.js` and `utils/matchDetail.js`: retain and display advanced API fields.
- Modify `pages/profile/profile.js`, `pages/profile/profile.wxml`, and `pages/profile/profile.wxss`: full personal data presentation.
- Modify `pages/match-detail/match-detail.js`, `pages/match-detail/match-detail.wxml`, and `pages/match-detail/match-detail.wxss`: GPM, XPM, source, and timestamps.
- Add focused tests under `tests/` for every pure module, API gate, UI contract, and rollback-sensitive field.

---

### Task 1: Normalize League Discovery and Full Match Statistics

**Files:**
- Create: `cloudfunctions/api/leagueSyncCore.js`
- Modify: `cloudfunctions/api/matchSources.js`
- Modify: `utils/matchImport.js`
- Test: `tests/leagueSyncCore.test.js`
- Test: `tests/matchSources.test.js`
- Test: `tests/matchImport.test.js`

**Interfaces:**
- Consumes: OpenDota league-list payloads and normalized OpenDota/Valve match payloads.
- Produces: `normalizeLeagueMatchIds(payload): string[]`, `classifyPreview(preview): { status, reason, unmatchedAccountIds }`, and player snapshots containing `playerSlot`, `heroId`, `kills`, `deaths`, `assists`, `goldPerMin`, and `xpPerMin`.

- [ ] **Step 1: Write failing league discovery and lineup classification tests**

```js
const { normalizeLeagueMatchIds, classifyPreview } = require('../cloudfunctions/api/leagueSyncCore');

test('normalizes and deduplicates league matches newest first', () => {
  assert.deepEqual(normalizeLeagueMatchIds([
    { match_id: 7001 }, { match_id: 7002 }, { match_id: 7001 }
  ]), ['7002', '7001']);
});

test('requires ten unique matched player cards for automatic settlement', () => {
  const players = Array.from({ length: 10 }, (_, index) => ({
    accountId: index + 1,
    playerId: index < 9 ? `p${index + 1}` : '',
    matched: index < 9,
    ambiguous: false
  }));
  assert.deepEqual(classifyPreview({ radiant: players.slice(0, 5), dire: players.slice(5) }), {
    status: 'needs_review',
    reason: 'unmatched_players',
    unmatchedAccountIds: [10]
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail because the module and advanced fields do not exist**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/leagueSyncCore.test.js tests/matchSources.test.js tests/matchImport.test.js`

Expected: FAIL with `Cannot find module '../cloudfunctions/api/leagueSyncCore'` or missing-field assertions.

- [ ] **Step 3: Implement the pure discovery and classification module**

```js
function normalizeLeagueMatchIds(payload) {
  const rows = Array.isArray(payload) ? payload : [];
  return Array.from(new Set(rows
    .map((row) => String(row && row.match_id || '').trim())
    .filter((id) => /^\d{6,20}$/.test(id))))
    .sort((left, right) => Number(right) - Number(left));
}

function classifyPreview(preview) {
  const participants = (preview.radiant || []).concat(preview.dire || []);
  const unmatchedAccountIds = participants
    .filter((player) => !player.matched)
    .map((player) => player.accountId);
  if ((preview.radiant || []).length !== 5 || (preview.dire || []).length !== 5) {
    return { status: 'needs_review', reason: 'incomplete_lineup', unmatchedAccountIds };
  }
  if (participants.some((player) => player.ambiguous)) {
    return { status: 'needs_review', reason: 'ambiguous_steam_id', unmatchedAccountIds };
  }
  if (unmatchedAccountIds.length) {
    return { status: 'needs_review', reason: 'unmatched_players', unmatchedAccountIds };
  }
  if (new Set(participants.map((player) => player.playerId)).size !== 10) {
    return { status: 'needs_review', reason: 'duplicate_players', unmatchedAccountIds };
  }
  return { status: 'ready', reason: '', unmatchedAccountIds: [] };
}

module.exports = { normalizeLeagueMatchIds, classifyPreview };
```

Extend player normalization and `decorateApiPlayer` to map `player_slot`, `gold_per_min`, and `xp_per_min` to the snapshot names in the interface. Change account matching from a single-value map to an account-to-player-array map so duplicate ownership sets `ambiguous: true` instead of silently selecting the last card.

- [ ] **Step 4: Run focused tests and verify all pass**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/leagueSyncCore.test.js tests/matchSources.test.js tests/matchImport.test.js`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit the normalization layer**

```powershell
git add cloudfunctions/api/leagueSyncCore.js cloudfunctions/api/matchSources.js utils/matchImport.js tests/leagueSyncCore.test.js tests/matchSources.test.js tests/matchImport.test.js
git commit -m "feat: normalize league matches for automatic sync"
```

---

### Task 2: Centralize Idempotent Match Settlement

**Files:**
- Create: `cloudfunctions/api/matchSettlement.js`
- Modify: `cloudfunctions/api/index.js`
- Test: `tests/matchSettlement.test.js`
- Test: `tests/matchImport.test.js`
- Test: `tests/matchRollback.test.js`

**Interfaces:**
- Consumes: a validated preview, all player documents, source metadata, and a CloudBase database adapter.
- Produces: `buildSettlement(preview, players, metadata)` with `match`, `playerUpdates`, and the unique ID `imported-{matchId}`; API helper `settleImportedMatch(preview, metadata)` persists it exactly once.

- [ ] **Step 1: Write failing pure settlement tests**

```js
const { buildSettlement } = require('../cloudfunctions/api/matchSettlement');

test('builds winner and loser updates plus rollback-safe metadata', () => {
  const preview = {
    matchId: '7002', radiantWin: true, radiantKills: 20, direKills: 10,
    radiant: Array.from({ length: 5 }, (_, i) => ({ playerId: `r${i}`, kills: 1 })),
    dire: Array.from({ length: 5 }, (_, i) => ({ playerId: `d${i}`, kills: 1 }))
  };
  const players = preview.radiant.concat(preview.dire).map((row) => ({
    id: row.playerId, points: 0, matches: 0, wins: 0
  }));
  const result = buildSettlement(preview, players, { source: 'league-auto', leagueId: '20040' });
  assert.equal(result.match.id, 'imported-7002');
  assert.equal(result.match.scoringVersion, 3);
  assert.equal(result.match.source, 'league-auto');
  assert.equal(result.playerUpdates.find((row) => row.id === 'r0').points, 2);
  assert.equal(result.playerUpdates.find((row) => row.id === 'd0').points, -1);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/matchSettlement.test.js tests/matchImport.test.js tests/matchRollback.test.js`

Expected: FAIL because `matchSettlement.js` is missing.

- [ ] **Step 3: Implement settlement construction and replace duplicated update loops**

```js
function buildSettlement(preview, players, metadata = {}) {
  const participants = preview.radiant.concat(preview.dire);
  const participantIds = participants.map((player) => player.playerId);
  if (participantIds.length !== 10 || new Set(participantIds).size !== 10 || participantIds.some((id) => !id)) {
    throw new Error('比赛阵容必须关联 10 位不同选手');
  }
  const winnerIds = new Set((preview.radiantWin ? preview.radiant : preview.dire).map((player) => player.playerId));
  const playerById = Object.fromEntries(players.map((player) => [player.id, player]));
  const playerUpdates = participantIds.map((id) => {
    const player = playerById[id];
    if (!player) throw new Error('比赛包含不存在的选手卡');
    const won = winnerIds.has(id);
    return {
      _id: player._id,
      id,
      points: Number(player.points || 0) + (won ? 2 : -1),
      matches: Number(player.matches || 0) + 1,
      wins: Number(player.wins || 0) + (won ? 1 : 0)
    };
  });
  const winnerIdsArray = Array.from(winnerIds);
  const match = {
    id: `imported-${preview.matchId}`,
    matchId: preview.matchId,
    title: `Dota 比赛 ${preview.matchId}`,
    winner: preview.radiantWin ? '天辉' : '夜魇',
    winnerSide: preview.radiantWin ? 'radiant' : 'dire',
    radiantWin: Boolean(preview.radiantWin),
    duration: Number(preview.duration || 0),
    startTime: Number(preview.startTime || 0),
    radiant: preview.radiant,
    dire: preview.dire,
    participantIds,
    winnerIds: winnerIdsArray,
    scoringVersion: 3,
    imported: true,
    lineupSource: metadata.source === 'league-auto' ? 'league-auto' : 'import-reconciled',
    source: metadata.source || 'manual-import',
    leagueId: String(metadata.leagueId || '')
  };
  return { match, playerUpdates };
}
```

In `index.js`, make both `confirmImportedMatch` and the new internal automatic path call `settleImportedMatch`. Claim `matches/imported-{matchId}` before player updates by using a database transaction. The transaction must re-check that the match does not exist, update all ten player documents, create the match document, and then mark the queue item `imported`.

- [ ] **Step 4: Run settlement and rollback tests**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/matchSettlement.test.js tests/matchImport.test.js tests/matchRollback.test.js tests/adminMatchResult.test.js`

Expected: all tests PASS and manual import still uses winner +2 / loser -1.

- [ ] **Step 5: Commit centralized settlement**

```powershell
git add cloudfunctions/api/matchSettlement.js cloudfunctions/api/index.js tests/matchSettlement.test.js tests/matchImport.test.js tests/matchRollback.test.js tests/adminMatchResult.test.js
git commit -m "refactor: centralize imported match settlement"
```

---

### Task 3: Add Queue Persistence and Protected Internal Sync Actions

**Files:**
- Modify: `cloudfunctions/api/index.js`
- Modify: `cloudfunctions/api/adminAuth.js`
- Test: `tests/leagueSyncApi.test.js`
- Test: `tests/adminPermissions.test.js`

**Interfaces:**
- Consumes: internal-token actions `assertLeagueSyncAdmin`, `getLeagueSyncStateInternal`, `discoverLeagueMatches`, and `processLeagueQueue`; administrator actions `setLeagueSyncEnabled`, `retryLeagueSyncMatch`, and `confirmLeagueSyncMatch`; bootstrap reads the client-safe state.
- Produces: queue documents keyed by match ID and a client-safe state `{ enabled, lastRunAt, lastSuccessAt, lastError, pendingCount, queue }`.

- [ ] **Step 1: Write source-contract and authorization tests**

```js
test('internal processing requires the server-only sync token', () => {
  assert.match(apiSource, /assertLeagueSyncToken\(event\.internalToken\)/);
  assert.match(apiSource, /processLeagueQueue/);
});

test('pause and review actions require administrator OpenID', () => {
  assert.match(apiSource, /setLeagueSyncEnabled\(openid/);
  assert.match(apiSource, /confirmLeagueSyncMatch\(openid/);
});

test('queue processing uses an expiring job lock', () => {
  assert.match(apiSource, /acquireLeagueSyncLock/);
  assert.match(apiSource, /lockExpiresAt/);
  assert.match(apiSource, /releaseLeagueSyncLock/);
});
```

- [ ] **Step 2: Run the tests and verify the new actions are absent**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/leagueSyncApi.test.js tests/adminPermissions.test.js`

Expected: FAIL on missing action and token assertions.

- [ ] **Step 3: Implement token gating, queue state, retries, and review confirmation**

```js
function assertLeagueSyncToken(value) {
  const expected = String(process.env.LEAGUE_SYNC_TOKEN || '');
  const actual = String(value || '');
  if (!expected || expected.length < 32 || actual !== expected) {
    throw new Error('自动同步内部调用未授权');
  }
}

function nextRetryAt(attempts, now = Date.now()) {
  const delays = [5, 15, 30, 60, 180, 360];
  const minutes = delays[Math.min(Math.max(0, attempts - 1), delays.length - 1)];
  return new Date(now + minutes * 60 * 1000);
}
```

Ensure `leagueSyncQueue` and `system` collections exist. `discoverLeagueMatches` upserts IDs without replacing terminal `imported` state. `processLeagueQueue` atomically acquires `system/leagueSync.lockExpiresAt` for five minutes, exits with `skipped: true` when a live lock exists, and clears its own lock in `finally`. It selects at most the requested batch size, and each selected item loads the full match, builds a preview, applies `classifyPreview`, then either settles or writes `needs_review`. Translate `MATCH_PENDING` to `waiting_data`; store sanitized errors and `nextRetryAt` for other failures. `assertLeagueSyncAdmin` first validates the internal token and then checks the forwarded OpenID. `confirmLeagueSyncMatch` requires the actual caller's administrator OpenID and delegates to the same settlement helper with selected Radiant and Dire IDs. `retryLeagueSyncMatch` requires an administrator and moves only `waiting_data`, `needs_review`, or `failed` rows back to `discovered` with `nextRetryAt` cleared.

- [ ] **Step 4: Run API and authorization tests**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/leagueSyncApi.test.js tests/adminPermissions.test.js tests/dataSafety.test.js`

Expected: all tests PASS; no test fixture secret appears in returned error strings.

- [ ] **Step 5: Commit the protected queue API**

```powershell
git add cloudfunctions/api/index.js cloudfunctions/api/adminAuth.js tests/leagueSyncApi.test.js tests/adminPermissions.test.js tests/dataSafety.test.js
git commit -m "feat: add protected league sync queue API"
```

---

### Task 4: Add the Scheduled `leagueSync` Cloud Function

**Files:**
- Create: `cloudfunctions/leagueSync/index.js`
- Create: `cloudfunctions/leagueSync/config.json`
- Create: `cloudfunctions/leagueSync/package.json`
- Test: `tests/leagueSyncFunction.test.js`

**Interfaces:**
- Consumes: OpenDota `GET /api/leagues/20040/matches`, `LEAGUE_SYNC_TOKEN`, and API cloud-function actions from Task 3.
- Produces: a bounded run summary `{ discovered, processed, imported, needsReview, failed }`.

- [ ] **Step 1: Write failing timer configuration and orchestration tests**

```js
test('timer runs every fifteen minutes', () => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.deepEqual(config.triggers, [{
    name: 'leagueSyncEvery15Minutes',
    type: 'timer',
    config: '0 0/15 * * * * *'
  }]);
});

test('function is pinned to league 20040 and uses a bounded batch', () => {
  assert.match(source, /const LEAGUE_ID = '20040'/);
  assert.match(source, /const BATCH_SIZE = 3/);
});
```

- [ ] **Step 2: Run tests and verify the function is missing**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/leagueSyncFunction.test.js`

Expected: FAIL because `cloudfunctions/leagueSync` does not exist.

- [ ] **Step 3: Implement scheduled discovery and bounded dispatch**

```js
const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const LEAGUE_ID = '20040';
const BATCH_SIZE = 3;

function fetchLeagueMatches(leagueId) {
  const url = `https://api.opendota.com/api/leagues/${encodeURIComponent(leagueId)}/matches`;
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 8000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`OpenDota 联赛接口请求失败 ${response.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (error) { reject(new Error('OpenDota 返回了无效数据')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('OpenDota 联赛接口请求超时')));
    request.on('error', reject);
  });
}

async function callApi(action, data = {}) {
  const result = await cloud.callFunction({
    name: 'api',
    data: { action, internalToken: process.env.LEAGUE_SYNC_TOKEN, ...data }
  });
  if (result.result && result.result.error) throw new Error(result.result.error);
  return result.result;
}

exports.main = async (event) => {
  const context = cloud.getWXContext();
  const manual = event && event.manual === true;
  if (manual) await callApi('assertLeagueSyncAdmin', { operatorOpenid: context.OPENID });
  const state = await callApi('getLeagueSyncStateInternal');
  if (!state.enabled) return { skipped: true, reason: 'paused' };
  const leagueMatches = await fetchLeagueMatches(LEAGUE_ID);
  await callApi('discoverLeagueMatches', { leagueId: LEAGUE_ID, matches: leagueMatches });
  return callApi('processLeagueQueue', { leagueId: LEAGUE_ID, batchSize: BATCH_SIZE });
};
```

Use the existing `https` request style and timeout behavior from `cloudfunctions/api/httpJson.js`; do not add a new HTTP dependency. The function validates manual callers through the API before discovery. Timer invocations have no user OpenID and rely only on the server-side token.

- [ ] **Step 4: Run timer tests**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/leagueSyncFunction.test.js tests/httpJson.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the scheduled function**

```powershell
git add cloudfunctions/leagueSync tests/leagueSyncFunction.test.js tests/httpJson.test.js
git commit -m "feat: schedule OpenDota league synchronization"
```

---

### Task 5: Add Administrator Sync and Review UI

**Files:**
- Create: `utils/leagueSyncView.js`
- Modify: `utils/cloudStore.js`
- Modify: `pages/match/match.js`
- Modify: `pages/match/match.wxml`
- Modify: `pages/match/match.wxss`
- Test: `tests/leagueSyncView.test.js`
- Test: `tests/leagueSyncUi.test.js`

**Interfaces:**
- Consumes: bootstrap `leagueSync` state, cloud function `leagueSync`, and API actions `setLeagueSyncEnabled`, `retryLeagueSyncMatch`, and `confirmLeagueSyncMatch`.
- Produces: formatted status text, review rows, Immediate Sync, Pause/Resume, Retry, and Confirm controls.

- [ ] **Step 1: Write failing formatter and UI contract tests**

```js
test('formats pending review rows without exposing raw cloud errors', () => {
  const view = buildLeagueSyncView({
    enabled: true,
    pendingCount: 1,
    queue: [{ matchId: '7002', status: 'needs_review', reason: 'unmatched_players' }]
  });
  assert.equal(view.statusText, '自动同步已开启');
  assert.equal(view.queue[0].reasonText, '有选手尚未关联');
});

test('match page exposes admin sync controls', () => {
  assert.match(wxml, /bindtap="runLeagueSyncNow"/);
  assert.match(wxml, /bindtap="toggleLeagueSync"/);
  assert.match(wxml, /bindtap="retryLeagueSyncMatch"/);
  assert.match(wxml, /bindtap="openLeagueReview"/);
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/leagueSyncView.test.js tests/leagueSyncUi.test.js tests/cloudStore.test.js`

Expected: FAIL because formatter and controls do not exist.

- [ ] **Step 3: Implement client methods and the admin panel**

```js
async function runLeagueSyncNow() {
  if (!canUseCloud()) throw new Error('自动同步需要启用云开发');
  const result = await wx.cloud.callFunction({ name: 'leagueSync', data: { manual: true } });
  clearCache();
  return result.result;
}

async function setLeagueSyncEnabled(enabled) {
  const state = await callApi('setLeagueSyncEnabled', { enabled: Boolean(enabled) });
  clearCache();
  return state;
}

async function retryLeagueSyncMatch(matchId) {
  const state = await callApi('retryLeagueSyncMatch', { matchId });
  clearCache();
  return state;
}
```

Add the sync panel only when `isAdmin` is true. Show last success, pending count, and sanitized latest error. Provide Retry for `waiting_data` and `failed` rows. Reuse the existing import preview picker for a selected queue row; initialize it from the queue preview, then call `confirmLeagueSyncMatch(matchId, radiantPlayerIds, direPlayerIds)`. Keep history grouped by date and add source labels for automatic import, manual import, and manual entry. Non-admin bootstrap may show a small last-sync status but no action controls.

- [ ] **Step 4: Run formatter, client, and page contract tests**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/leagueSyncView.test.js tests/leagueSyncUi.test.js tests/cloudStore.test.js tests/matchLineupUi.test.js`

Expected: all tests PASS and existing manual import controls remain present.

- [ ] **Step 5: Commit the administrator workflow**

```powershell
git add utils/leagueSyncView.js utils/cloudStore.js pages/match/match.js pages/match/match.wxml pages/match/match.wxss tests/leagueSyncView.test.js tests/leagueSyncUi.test.js tests/cloudStore.test.js tests/matchLineupUi.test.js
git commit -m "feat: add league sync administrator workflow"
```

---

### Task 6: Add Personal Inhouse Statistics and Rich Match Detail

**Files:**
- Create: `utils/playerMatchStats.js`
- Modify: `utils/matchDetail.js`
- Modify: `pages/profile/profile.js`
- Modify: `pages/profile/profile.wxml`
- Modify: `pages/profile/profile.wxss`
- Modify: `pages/match-detail/match-detail.js`
- Modify: `pages/match-detail/match-detail.wxml`
- Modify: `pages/match-detail/match-detail.wxss`
- Test: `tests/playerMatchStats.test.js`
- Test: `tests/profileMatchStatsUi.test.js`
- Test: `tests/matchDetail.test.js`

**Interfaces:**
- Consumes: current player, point-sorted players, and stored mini-program matches.
- Produces: `buildPlayerMatchStats(player, players, matches)` with rank, record, KDA totals/averages, GPM/XPM averages, top heroes, Steam IDs, and recent matches.

- [ ] **Step 1: Write failing aggregate tests**

```js
test('aggregates only stored matches containing the current player', () => {
  const stats = buildPlayerMatchStats(
    { id: 'p1', points: 2, steamIds: ['1', '2'] },
    [{ id: 'p2', points: 4 }, { id: 'p1', points: 2 }],
    [{
      id: 'imported-1', participantIds: ['p1', 'p2'], winnerIds: ['p1'], duration: 1800,
      radiant: [{ playerId: 'p1', heroId: 10, kills: 8, deaths: 2, assists: 12, goldPerMin: 600, xpPerMin: 700 }],
      dire: [{ playerId: 'p2' }]
    }]
  );
  assert.equal(stats.rank, 2);
  assert.equal(stats.matches, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.winRateText, '100.0%');
  assert.equal(stats.kdaText, '10.00');
  assert.deepEqual(stats.steamIds, ['1', '2']);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/playerMatchStats.test.js tests/profileMatchStatsUi.test.js tests/matchDetail.test.js`

Expected: FAIL because `playerMatchStats.js` and UI fields are missing.

- [ ] **Step 3: Implement zero-safe aggregates and profile rendering**

```js
const { sortPlayersByPoints } = require('./playerRanking');
const { normalizeSteamIds } = require('./playerProfile');

function buildRecentMatches(rows) {
  return rows.map(({ match, snapshot }) => ({
    id: match.id,
    won: (match.winnerIds || []).includes(snapshot.playerId),
    resultText: (match.winnerIds || []).includes(snapshot.playerId) ? '胜利' : '失败',
    heroId: Number(snapshot.heroId || 0),
    kdaText: `${Number(snapshot.kills || 0)} / ${Number(snapshot.deaths || 0)} / ${Number(snapshot.assists || 0)}`,
    duration: Number(match.duration || 0),
    createdAt: match.createdAt || match.syncedAt || null
  }));
}

function buildHeroSummary(rows) {
  const byHero = {};
  rows.forEach(({ match, snapshot }) => {
    const heroId = Number(snapshot.heroId || 0);
    if (!heroId) return;
    if (!byHero[heroId]) byHero[heroId] = { heroId, matches: 0, wins: 0 };
    byHero[heroId].matches += 1;
    if ((match.winnerIds || []).includes(snapshot.playerId)) byHero[heroId].wins += 1;
  });
  return Object.values(byHero).sort((left, right) => right.matches - left.matches || right.wins - left.wins);
}

function buildPlayerMatchStats(player, players, matches) {
  const relevant = (matches || []).filter((match) => (match.participantIds || []).includes(player.id));
  const snapshots = relevant.map((match) => {
    const all = (match.radiant || []).concat(match.dire || []);
    return { match, snapshot: all.find((row) => row.playerId === player.id) || {} };
  });
  const totals = snapshots.reduce((sum, row) => ({
    kills: sum.kills + Number(row.snapshot.kills || 0),
    deaths: sum.deaths + Number(row.snapshot.deaths || 0),
    assists: sum.assists + Number(row.snapshot.assists || 0),
    gpm: sum.gpm + Number(row.snapshot.goldPerMin || 0),
    xpm: sum.xpm + Number(row.snapshot.xpPerMin || 0)
  }), { kills: 0, deaths: 0, assists: 0, gpm: 0, xpm: 0 });
  const wins = relevant.filter((match) => (match.winnerIds || []).includes(player.id)).length;
  const count = relevant.length;
  return {
    rank: sortPlayersByPoints(players).findIndex((row) => row.id === player.id) + 1,
    matches: count,
    wins,
    losses: count - wins,
    winRateText: count ? `${(wins * 100 / count).toFixed(1)}%` : '0.0%',
    kdaText: ((totals.kills + totals.assists) / Math.max(1, totals.deaths)).toFixed(2),
    totals,
    steamIds: normalizeSteamIds(player.steamIds || player.steamId || ''),
    recentMatches: buildRecentMatches(snapshots.slice(0, 20)),
    heroes: buildHeroSummary(snapshots.slice(0, 20))
  };
}
```

Add `averageKills`, `averageDeaths`, `averageAssists`, `averageGpm`, and `averageXpm` using a divisor of `Math.max(1, count)`. Render points/rank, matches/wins/losses/win rate, totals, per-game averages, GPM/XPM, recent 20 heroes, bound Steam IDs, and recent matches. Keep the player-card editor below the statistics. Extend match detail rows with GPM and XPM and label record source as automatic import, manual import, or manual entry.

- [ ] **Step 4: Run aggregate and UI tests**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests/playerMatchStats.test.js tests/profileMatchStatsUi.test.js tests/matchDetail.test.js tests/playerProfile.test.js`

Expected: all tests PASS, including zero-match and missing-stat fixtures.

- [ ] **Step 5: Commit personal statistics and details**

```powershell
git add utils/playerMatchStats.js utils/matchDetail.js pages/profile pages/match-detail tests/playerMatchStats.test.js tests/profileMatchStatsUi.test.js tests/matchDetail.test.js tests/playerProfile.test.js
git commit -m "feat: show complete personal inhouse statistics"
```

---

### Task 7: Integrate, Verify, and Document Cloud Deployment

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-17-opendota-league-auto-sync-design.md` only if implementation reveals a factual deployment correction.
- Test: all files under `tests/`.

**Interfaces:**
- Consumes: completed feature from Tasks 1-6.
- Produces: a verified source tree plus exact WeChat Developer Tools deployment instructions.

- [ ] **Step 1: Add deployment instructions with no secret values committed**

Document these exact operator actions:

```text
1. In both api and leagueSync cloud-function settings, create LEAGUE_SYNC_TOKEN with the same random value of at least 32 characters.
2. Keep STEAM_WEB_API_KEY only on api.
3. Right-click cloudfunctions/api and choose Upload and deploy: cloud install dependencies.
4. Right-click cloudfunctions/leagueSync and choose Upload and deploy: cloud install dependencies.
5. Right-click cloudfunctions/leagueSync and choose Upload trigger.
6. Open the match page as an administrator and run Immediate Sync.
7. Confirm leagueSyncQueue and matches records are visible from a second phone.
```

- [ ] **Step 2: Run the full automated suite**

Run: `C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test`

Expected: every test passes; there are no unhandled promise rejections.

- [ ] **Step 3: Run static and repository safety checks**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `rg -n "LEAGUE_SYNC_TOKEN\s*[:=]\s*['\"][^'\"]+" --glob "!docs/**"`

Expected: no hard-coded token value.

Run: `git status --short`

Expected: only intended feature files plus the pre-existing untracked `assets/` directory.

- [ ] **Step 4: Perform WeChat Developer Tools and phone verification**

Verify in order:

```text
- leagueSync function and timer trigger deploy successfully.
- Immediate Sync updates last-success time.
- A fully matched test fixture imports once and changes winner +2 / loser -1.
- Re-running sync does not change points again.
- An unknown Steam ID appears in administrator review and does not change points.
- Administrator reconciliation imports the reviewed match once.
- My page shows rank, record, KDA, GPM, XPM, heroes, Steam IDs, and recent matches.
- Match detail opens from My and History pages.
- Deleting the imported fixture restores points, matches, and wins.
- A second phone sees the same records and statistics.
```

- [ ] **Step 5: Commit deployment documentation**

```powershell
git add README.md docs/superpowers/specs/2026-07-17-opendota-league-auto-sync-design.md
git commit -m "docs: add league sync deployment steps"
```

- [ ] **Step 6: Record the final verification state**

Run: `git log -8 --oneline`

Expected: separate commits for normalization, settlement, queue API, scheduled function, administrator UI, personal statistics, and deployment documentation.

Run: `git status --short --branch`

Expected: branch ahead of its remote until the user asks to push; pre-existing `assets/` may remain untracked.
