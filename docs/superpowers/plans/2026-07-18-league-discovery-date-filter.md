# League Discovery Date Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use league-summary start times to converge old queued matches before detail loading while preserving imported history.

**Architecture:** Normalize league discovery payloads into match ID and start-time records without breaking existing ID-only callers. Reconcile each discovery record transactionally, giving authoritative stored matches and protected queue states precedence over the pre-start filter.

**Tech Stack:** WeChat cloud functions, CommonJS JavaScript, CloudBase transactions, Node.js built-in test runner.

## Global Constraints

- Fixed inclusive boundary: `1784304000` Unix seconds.
- Existing `matches` and player statistics remain unchanged.
- Only `discovered`, `waiting_data`, and `failed` queue rows may be converted by discovery to `ignored_before_start`.
- `imported`, `needs_review`, `processing`, and existing `ignored_before_start` rows are preserved unless an authoritative match requires convergence to `imported`.
- Settlement-time filtering remains enabled.

---

### Task 1: Preserve Discovery Start Times

**Files:**
- Modify: `cloudfunctions/api/leagueSyncCore.js`
- Modify: `cloudfunctions/api/valveLeagueHistory.js`
- Test: `tests/leagueSyncCore.test.js`
- Test: `tests/valveLeagueHistory.test.js`

**Interfaces:**
- Produces: `normalizeLeagueMatchRecords(payload)` returning `{ matchId, startTime }[]`, sorted newest ID first.
- Preserves: `normalizeLeagueMatchIds(payload)` returning the existing string ID array.
- Produces: Valve summaries containing `{ match_id, start_time }`.

- [ ] **Step 1: Add failing normalization tests**

Cover `start_time`, `startTime`, missing/invalid values, duplicate IDs where one row supplies a valid time, and 20-digit ID ordering. Update the Valve expectation to retain `start_time`.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/leagueSyncCore.test.js tests/valveLeagueHistory.test.js
```

Expected: failures because discovery currently returns IDs only and Valve drops start times.

- [ ] **Step 3: Implement record normalization**

In `leagueSyncCore.js`, validate IDs with the existing rule, normalize positive finite start times to integer seconds, merge duplicate rows by retaining a valid time, and derive `normalizeLeagueMatchIds` from the new record helper.

In `valveLeagueHistory.js`, preserve a valid integer `start_time` while deduplicating Valve rows.

- [ ] **Step 4: Run focused tests**

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/leagueSyncCore.test.js tests/valveLeagueHistory.test.js
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit discovery normalization**

```powershell
git add -- cloudfunctions/api/leagueSyncCore.js cloudfunctions/api/valveLeagueHistory.js tests/leagueSyncCore.test.js tests/valveLeagueHistory.test.js
git commit -m "feat: preserve league discovery start times"
```

---

### Task 2: Reconcile Old Queue Rows During Discovery

**Files:**
- Modify: `cloudfunctions/api/index.js`
- Modify: `cloudfunctions/api/leagueSyncApi.js`
- Test: `tests/leagueSyncApi.test.js`

**Interfaces:**
- Consumes: `normalizeLeagueMatchRecords(payload)` from Task 1.
- Produces: unchanged `discoverLeagueMatches(token, payload, metadata)` response shape `{ discovered, inserted }`.

- [ ] **Step 1: Add failing reconciliation tests**

Add discovery payloads with pre-start, post-start, and missing start times. Assert that:

- A new pre-start summary is created as `ignored_before_start`.
- Existing `waiting_data`, `failed`, and `discovered` rows become ignored.
- Existing `imported`, `needs_review`, `processing`, and ignored rows remain unchanged.
- An authoritative `matches/imported-{matchId}` record converges its queue row to `imported`.
- Post-start and missing-time summaries keep the existing discovered behavior.

- [ ] **Step 2: Run API tests and verify RED**

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/leagueSyncApi.test.js
```

Expected: failures because discovery currently discards start times and preserves every existing row.

- [ ] **Step 3: Inject record normalization**

Pass `normalizeLeagueMatchRecords` from `cloudfunctions/api/index.js` into `createLeagueSyncApi`, and update the test API factory with the same dependency.

- [ ] **Step 4: Implement transactional discovery reconciliation**

For every normalized record, check in this order inside the existing transaction:

1. Authoritative imported match: set or update the queue row to `imported` without settlement.
2. Protected existing status: preserve it.
3. Pre-start summary: set or update the row to `ignored_before_start`, clear retry/processing fields, and store the discovery start time.
4. Existing non-old row: preserve it.
5. Missing row: create the existing `discovered` record and include `startTime` when available.

Use `classifyMatchStartTime` for the boundary decision. Do not call `settleImportedMatch` from discovery.

- [ ] **Step 5: Run focused and complete verification**

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/leagueSyncApi.test.js
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
```

Expected: API tests and the complete suite pass with zero failures.

- [ ] **Step 6: Commit queue reconciliation**

```powershell
git add -- cloudfunctions/api/index.js cloudfunctions/api/leagueSyncApi.js tests/leagueSyncApi.test.js
git commit -m "feat: converge old league queue rows"
```
