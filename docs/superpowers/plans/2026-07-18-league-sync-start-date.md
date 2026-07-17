# League Sync Start Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep existing match records while preventing newly processed league matches before 2026-07-18 00:00 Asia/Shanghai from settlement.

**Architecture:** Define one fixed Unix timestamp and one pure start-time classifier in the league synchronization state module. Apply the classifier immediately after preview loading and again before administrator-confirmed settlement; persist old matches as a non-retryable terminal queue status and leave missing-time matches retryable.

**Tech Stack:** WeChat cloud functions, CommonJS JavaScript, CloudBase database, Node.js built-in test runner.

## Global Constraints

- Fixed inclusive boundary: `1784304000` Unix seconds (`2026-07-18 00:00:00 +08:00`).
- Existing `matches` and player statistics must not be read for migration, changed, or deleted.
- `ignored_before_start` is terminal and not retryable.
- Missing or invalid match time must never settle and remains `waiting_data`.
- All discovery sources use the same settlement gate.

---

### Task 1: Enforce the Start-Date Settlement Gate

**Files:**
- Modify: `cloudfunctions/api/leagueSyncState.js`
- Modify: `cloudfunctions/api/leagueSyncApi.js`
- Test: `tests/leagueSyncApi.test.js`

**Interfaces:**
- Produces: `LEAGUE_SYNC_START_TIME` and `classifyMatchStartTime(value)` returning `missing`, `before_start`, or `eligible`.
- Consumes: normalized preview `startTime` values in automatic processing and administrator confirmation.

- [ ] **Step 1: Add failing date-gate tests**

Update `readyPreview` to include `startTime: 1784304000`, then add tests covering a preview before the boundary, exactly at the boundary, and with no time. Assert that only the boundary preview reaches `settleImportedMatch`, the old row becomes `ignored_before_start`, and the missing row becomes `waiting_data`.

Also add a confirmation regression test proving an old `needs_review` preview cannot call settlement, and add an administrator bootstrap assertion proving an ignored row does not increase `pendingCount`.

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/leagueSyncApi.test.js
```

Expected: failures because old and missing-time previews currently continue to classification and settlement.

- [ ] **Step 3: Add the pure start-time classifier**

In `cloudfunctions/api/leagueSyncState.js` add:

```js
const LEAGUE_SYNC_START_TIME = 1784304000;

function classifyMatchStartTime(value) {
  const startTime = Number(value);
  if (!Number.isFinite(startTime) || startTime <= 0) return 'missing';
  return startTime < LEAGUE_SYNC_START_TIME ? 'before_start' : 'eligible';
}
```

Export both symbols.

- [ ] **Step 4: Apply the classifier before settlement**

In `cloudfunctions/api/leagueSyncApi.js`:

- For `missing`, throw an error with `code = 'MATCH_PENDING'` so the existing retry path stores `waiting_data`.
- For `before_start`, update the queue row to `ignored_before_start`, clear retry and processing fields, retain the normalized preview, and return without calling classification or settlement.
- For administrator confirmation, apply the same decision before lineup reconciliation. Convert old previews to `ignored_before_start`; convert missing-time previews to `waiting_data` with the existing retry schedule; never settle either case.
- Leave `PENDING_STATUSES`, `RETRYABLE_STATUSES`, and eligibility selection unchanged so ignored rows are terminal by construction.

- [ ] **Step 5: Run the API synchronization tests**

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/leagueSyncApi.test.js
```

Expected: all API synchronization tests pass.

- [ ] **Step 6: Commit the server behavior**

```powershell
git add -- cloudfunctions/api/leagueSyncState.js cloudfunctions/api/leagueSyncApi.js tests/leagueSyncApi.test.js
git commit -m "feat: enforce league sync start date"
```

---

### Task 2: Label Ignored Queue Rows

**Files:**
- Modify: `utils/leagueSyncView.js`
- Test: `tests/leagueSyncView.test.js`

**Interfaces:**
- Consumes: queue rows with status `ignored_before_start`.
- Produces: administrator-facing status text `起算日前，已忽略` with retry and review actions disabled.

- [ ] **Step 1: Add the failing view test**

Add a queue row with `status: 'ignored_before_start'` and assert:

```js
assert.equal(view.queue[0].statusText, '起算日前，已忽略');
assert.equal(view.queue[0].canRetry, false);
assert.equal(view.queue[0].canReview, false);
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/leagueSyncView.test.js
```

Expected: FAIL because the new status has no display label.

- [ ] **Step 3: Add the status label**

Add the following entry to `STATUS_TEXT` in `utils/leagueSyncView.js`:

```js
ignored_before_start: '起算日前，已忽略'
```

Existing `canRetry` and `canReview` conditions already keep both actions disabled.

- [ ] **Step 4: Run focused and complete verification**

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/leagueSyncView.test.js
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
```

Expected: focused tests and the complete suite pass with zero failures.

- [ ] **Step 5: Commit the administrator label**

```powershell
git add -- utils/leagueSyncView.js tests/leagueSyncView.test.js
git commit -m "feat: label pre-start league matches"
```
