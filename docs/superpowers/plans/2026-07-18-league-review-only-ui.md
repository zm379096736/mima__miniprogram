# League Review-Only UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the league synchronization panel show and count only matches that require administrator confirmation.

**Architecture:** Keep the full synchronization queue unchanged for backend discovery, waiting, retry, and settlement. Narrow only the client bootstrap response to `needs_review` rows, then apply the same filter in the presentation helper as a defensive boundary before rendering.

**Tech Stack:** WeChat native mini program, Node.js cloud functions, WeChat Cloud Database, `node:test`.

## Global Constraints

- Do not delete or update queue rows while building client state.
- Do not change automatic synchronization, retry scheduling, settlement, points, or historical matches.
- Keep the public response field name `pendingCount`, but make its client-facing meaning “number of matches needing confirmation”.
- Return at most 20 review rows to administrators.
- Avoid requiring a new compound Cloud Database index: fetch a bounded `needs_review` set, sort by `updatedAt` in application code, then slice to 20.
- Use the exact UI copy `待确认 X 场` and `暂无需要确认的比赛`.

---

### Task 1: Return A Review-Only Client Queue

**Files:**
- Modify: `cloudfunctions/api/leagueSyncApi.js:577-593`
- Test: `tests/leagueSyncApi.test.js:925-963`

**Interfaces:**
- Consumes: `dateValue(value)` from `cloudfunctions/api/leagueSyncState.js` and queue rows with `status`, `updatedAt`, and `matchId`.
- Produces: `getClientLeagueSyncState(openid)` with review-only `pendingCount`; administrators additionally receive `queuePreview: SafeQueueRow[]` containing at most 20 `needs_review` rows.

- [ ] **Step 1: Rewrite the bootstrap regression test to include visible and hidden statuses**

Replace the queue setup and assertions in `bootstrap state is client-safe and includes a bounded queue only for administrators` with a mixed queue. Create 23 `needs_review` rows and one row for each hidden status:

```js
  const hiddenStatuses = [
    'waiting_data',
    'ignored_before_start',
    'failed',
    'processing',
    'discovered',
    'imported'
  ];
  for (let index = 0; index < 23; index += 1) {
    const matchId = String(800000 + index);
    db.state.leagueSyncQueue[matchId] = {
      _id: matchId,
      matchId,
      status: 'needs_review',
      preview: readyPreview(matchId),
      error: `raw https://upstream.invalid/queue?token=${TOKEN}`,
      updatedAt: new Date(Date.UTC(2026, 6, 17, 2, index))
    };
  }
  hiddenStatuses.forEach((status, index) => {
    const matchId = String(900000 + index);
    db.state.leagueSyncQueue[matchId] = {
      _id: matchId,
      matchId,
      status,
      updatedAt: new Date(Date.UTC(2026, 6, 18, 2, index))
    };
  });
```

Assert the client count, privacy boundary, status filter, limit, and descending order:

```js
  assert.equal(playerState.pendingCount, 23);
  assert.equal('queuePreview' in playerState, false);
  assert.equal(adminState.pendingCount, 23);
  assert.equal(adminState.queuePreview.length, 20);
  assert.equal(adminState.queuePreview.every((row) => row.status === 'needs_review'), true);
  assert.deepEqual(
    adminState.queuePreview.map((row) => row.matchId),
    Array.from({ length: 20 }, (_, index) => String(800022 - index))
  );
  assert.equal('lockOwner' in adminState, false);
  assert.equal('lockExpiresAt' in adminState, false);
  assert.equal(JSON.stringify(adminState).includes('private-owner'), false);
  assert.equal(JSON.stringify(adminState).includes(TOKEN), false);
  assert.equal(JSON.stringify(adminState).includes('https://upstream.invalid'), false);
```

- [ ] **Step 2: Run the focused test and verify the old broad queue behavior fails**

Run:

```bash
node --test --test-name-pattern="bootstrap state is client-safe" tests/leagueSyncApi.test.js
```

Expected: FAIL because `pendingCount` includes non-review statuses and `queuePreview` contains hidden rows.

- [ ] **Step 3: Replace broad pending counting and preview loading with review-only helpers**

Replace `pendingCount()` and the administrator preview query in `cloudfunctions/api/leagueSyncApi.js`:

```js
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
```

- [ ] **Step 4: Run the focused API test and then the full API test file**

Run:

```bash
node --test --test-name-pattern="bootstrap state is client-safe" tests/leagueSyncApi.test.js
node --test tests/leagueSyncApi.test.js
```

Expected: both commands PASS; the full file reports zero failed tests.

- [ ] **Step 5: Commit the server response change**

```bash
git add cloudfunctions/api/leagueSyncApi.js tests/leagueSyncApi.test.js
git commit -m "feat: return review-only league queue"
```

### Task 2: Render Only Matches Needing Confirmation

**Files:**
- Modify: `utils/leagueSyncView.js:61-78`
- Modify: `pages/match/match.wxml:23-40`
- Test: `tests/leagueSyncView.test.js:5-59`
- Test: `tests/leagueSyncUi.test.js:8-18`

**Interfaces:**
- Consumes: `{ pendingCount, queuePreview }` returned by `getClientLeagueSyncState(openid)`.
- Produces: `buildLeagueSyncView(state)` with `pendingText: string` and `queue: DecoratedQueueRow[]`, where every queue row has status `needs_review`.

- [ ] **Step 1: Update view-helper tests for confirmation copy and defensive filtering**

In the first `tests/leagueSyncView.test.js` test, change the badge assertion to:

```js
  assert.equal(view.pendingText, '待确认 1 场');
```

Replace the retryable and ignored-row presentation tests with a single defensive-filter regression:

```js
test('hides every queue status that does not need administrator confirmation', () => {
  const view = buildLeagueSyncView({
    pendingCount: 1,
    queuePreview: [
      { matchId: '7001', status: 'waiting_data' },
      { matchId: '7002', status: 'ignored_before_start' },
      { matchId: '7003', status: 'failed' },
      { matchId: '7004', status: 'processing' },
      { matchId: '7005', status: 'discovered' },
      { matchId: '7006', status: 'imported' },
      { matchId: '7007', status: 'needs_review', preview: { matchedCount: 8 } }
    ]
  });

  assert.deepEqual(view.queue.map((row) => row.matchId), ['7007']);
  assert.equal(view.queue[0].canReview, true);
});
```

Keep the existing raw-error sanitization assertion by moving it to a state-level test that checks `view.errorText` without expecting a failed queue row to render:

```js
test('sanitizes state errors without leaking raw upstream details', () => {
  const view = buildLeagueSyncView({
    enabled: false,
    lastError: 'request failed https://api.opendota.com/api/matches/7002?api_key=secret'
  });

  assert.equal(view.statusText, '自动同步已暂停');
  assert.equal(view.errorText.includes('http'), false);
});
```

- [ ] **Step 2: Add a markup regression for the empty review state**

Add to `tests/leagueSyncUi.test.js`:

```js
test('league sync panel shows an empty state when no matches need confirmation', () => {
  assert.match(wxml, /wx:else[^>]*class="sync-empty"/);
  assert.match(wxml, /暂无需要确认的比赛/);
});
```

- [ ] **Step 3: Run the focused view and UI tests and verify they fail**

Run:

```bash
node --test tests/leagueSyncView.test.js tests/leagueSyncUi.test.js
```

Expected: FAIL because the badge still says `待处理`, hidden statuses still render, and no empty-state markup exists.

- [ ] **Step 4: Narrow the presentation helper and update the badge copy**

Change the relevant fields in `buildLeagueSyncView`:

```js
    pendingText: `待确认 ${pendingCount} 场`,
    lastSuccessText: dateText(state.lastSuccessAt),
    errorText: cleanDisplayError(state.lastError),
    queue: queue
      .filter((row) => row && row.status === 'needs_review')
      .map(decorateQueueRow)
```

- [ ] **Step 5: Add the review-queue empty state to the administrator panel**

Immediately after the closing tag of `<view wx:if="{{leagueSyncView.queue.length}}" class="sync-queue">` in `pages/match/match.wxml`, add:

```xml
    <view wx:else class="sync-empty">暂无需要确认的比赛</view>
```

Use the existing global subdued text styling by extending the existing `.sync-error, .sync-row-error` neighborhood in `pages/match/match.wxss` with a focused rule:

```css
.sync-empty {
  padding: 24rpx 0 4rpx;
  color: #8f877b;
  text-align: center;
  font-size: 23rpx;
}
```

- [ ] **Step 6: Run focused tests and the full project suite**

Run:

```bash
node --test tests/leagueSyncView.test.js tests/leagueSyncUi.test.js
npm test
```

Expected: focused tests PASS; full suite reports zero failed tests.

- [ ] **Step 7: Inspect the final diff for scope and commit the UI change**

Run:

```bash
git diff --check
git diff -- utils/leagueSyncView.js pages/match/match.wxml pages/match/match.wxss tests/leagueSyncView.test.js tests/leagueSyncUi.test.js
```

Expected: no whitespace errors; diff contains only review-only filtering, copy, empty-state styling, and regression tests.

Commit:

```bash
git add utils/leagueSyncView.js pages/match/match.wxml pages/match/match.wxss tests/leagueSyncView.test.js tests/leagueSyncUi.test.js
git commit -m "feat: show only matches needing confirmation"
```

