# Automatic Steam Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically bind imported Dota account IDs to administrator-selected player cards, with protected permanent-owner conflicts and confirmed temporary-card merging.

**Architecture:** Add a cloud-only identity domain module for canonical Steam ownership and player-ID migration, then use a database service to apply merges and bindings inside the existing imported-match transaction. Both match confirmation routes and the administrator editor consume one structured `merge_required` preflight contract; the mini program confirms that contract and retries with exact merge approvals.

**Tech Stack:** WeChat native mini program, Node.js cloud functions, WeChat Cloud Database transactions, `node:test`.

## Global Constraints

- Store imported Dota `account_id` values as normalized decimal strings in `steamIds`; keep `steamId` as the joined legacy display field.
- Preserve support for both account ID and Steam64 input aliases.
- A permanent-owner conflict causes zero match, score, binding, or merge writes.
- A temporary-owner conflict returns `status: 'merge_required'` without writes until the administrator explicitly approves the exact temporary-to-target pair.
- Preserve the permanent card's WeChat identity, name, avatar, self-rating, preferred positions, and profile completion state.
- Merge points, matches, wins, MVP, touch, pigeon, and pressure exactly once.
- Migrate historical match and current room references before deleting a temporary card.
- Reject a merge when temporary and target players coexist in one historical match or conflicting team slots.
- Manual win/loss-only entries remain unchanged because they contain no Dota account IDs.
- Ordinary members cannot edit another player's IDs or approve a merge.
- Do not stage or modify the untracked `assets/` directory.

---

### Task 1: Canonical Ownership And Migration Rules

**Files:**
- Create: `cloudfunctions/api/playerIdentity.js`
- Modify: `cloudfunctions/api/temporaryPlayer.js`
- Create: `tests/playerIdentity.test.js`

**Interfaces:**
- Consumes: imported participant rows shaped as `{ accountId: number|string, playerId: string }` and existing player cards.
- Produces: `canonicalAccountId(value)`, `buildSteamBindingPlan(preview, players, approvals)`, `mergePlayerData(temporary, target)`, `replacePlayerIdInMatch(match, fromId, toId)`, `replacePlayerIdInRoom(room, fromId, toId)`, and `assertMergeHasNoCollision(matches, room, fromId, toId)`.

- [ ] **Step 1: Export existing normalization helpers from the cloud temporary-player module**

Extend `cloudfunctions/api/temporaryPlayer.js` without changing behavior:

```js
module.exports = {
  normalizeSteamIds,
  steamIdsForPlayer,
  buildTemporaryPlayer,
  findClaimableTemporaryPlayer,
  assertSteamIdsAvailable
};
```

- [ ] **Step 2: Write ownership-plan tests**

Create `tests/playerIdentity.test.js` with fixtures for one imported row and these assertions:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canonicalAccountId,
  buildSteamBindingPlan,
  mergePlayerData,
  replacePlayerIdInMatch,
  replacePlayerIdInRoom,
  assertMergeHasNoCollision
} = require('../cloudfunctions/api/playerIdentity');

const preview = (accountId, playerId) => ({
  radiant: [{ accountId, playerId }],
  dire: []
});

test('canonical account ids accept account id and Steam64 aliases', () => {
  assert.equal(canonicalAccountId('12345'), '12345');
  assert.equal(canonicalAccountId('76561197960278073'), '12345');
  assert.equal(canonicalAccountId('not-an-id'), '');
});

test('unowned imported account id is planned for the selected player', () => {
  const plan = buildSteamBindingPlan(preview(12345, 'target'), [
    { id: 'target', temporary: false, steamIds: ['88'] }
  ]);
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.bindings, [{ playerId: 'target', accountIds: ['12345'] }]);
  assert.deepEqual(plan.merges, []);
});

test('Steam64 alias already owned by selected player is not duplicated', () => {
  const plan = buildSteamBindingPlan(preview(12345, 'target'), [
    { id: 'target', temporary: false, steamIds: ['76561197960278073'] }
  ]);
  assert.deepEqual(plan.bindings, []);
});

test('permanent owner conflict names the id and owner', () => {
  assert.throws(
    () => buildSteamBindingPlan(preview(12345, 'target'), [
      { id: 'target', name: '目标', temporary: false },
      { id: 'owner', name: '小柿', temporary: false, steamIds: ['12345'] }
    ]),
    /Steam ID 12345 已绑定正式选手“小柿”/
  );
});

test('temporary owner returns a no-write merge requirement', () => {
  const plan = buildSteamBindingPlan(preview(12345, 'target'), [
    { id: 'target', name: '正式', temporary: false },
    { id: 'temp', name: '临时', temporary: true, openid: '', steamIds: ['12345'] }
  ]);
  assert.equal(plan.status, 'merge_required');
  assert.deepEqual(plan.merges, [{
    temporaryPlayerId: 'temp',
    temporaryName: '临时',
    targetPlayerId: 'target',
    targetName: '正式',
    accountIds: ['12345']
  }]);
});

test('exact approval makes a temporary merge plan ready', () => {
  const plan = buildSteamBindingPlan(preview(12345, 'target'), [
    { id: 'target', name: '正式', temporary: false },
    { id: 'temp', name: '临时', temporary: true, openid: '', steamIds: ['12345'] }
  ], [{ temporaryPlayerId: 'temp', targetPlayerId: 'target' }]);
  assert.equal(plan.status, 'ready');
  assert.equal(plan.merges[0].temporaryPlayerId, 'temp');
});
```

- [ ] **Step 3: Write migration tests**

Add tests proving profile preservation, counter addition, reference replacement, and collision rejection:

```js
test('temporary merge preserves permanent profile and combines counters and ids', () => {
  const merged = mergePlayerData(
    { id: 'temp', temporary: true, steamIds: ['12345'], points: 3, matches: 2, wins: 1, mvp: 1, touch: 2, pigeon: 1, pressure: 1 },
    { id: 'real', openid: 'wx', name: '正式', avatarUrl: 'cloud://avatar', score: 92,
      preferredPositions: [2, 3], profileCompleted: true, steamIds: ['88'], points: 4,
      matches: 5, wins: 3, mvp: 2, touch: 1, pigeon: 0, pressure: 2 }
  );
  assert.equal(merged.openid, 'wx');
  assert.equal(merged.name, '正式');
  assert.equal(merged.score, 92);
  assert.deepEqual(merged.steamIds, ['88', '12345']);
  assert.deepEqual(
    [merged.points, merged.matches, merged.wins, merged.mvp, merged.touch, merged.pigeon, merged.pressure],
    [7, 7, 4, 3, 3, 1, 3]
  );
});

test('match and room migration replace every player reference', () => {
  const match = replacePlayerIdInMatch({
    participantIds: ['temp', 'p2'], winnerIds: ['temp'], plannedParticipantIds: ['temp'],
    radiant: [{ playerId: 'temp' }], dire: [{ playerId: 'p2' }],
    mvpId: 'temp', pressureId: 'temp'
  }, 'temp', 'real');
  assert.deepEqual(match.participantIds, ['real', 'p2']);
  assert.equal(match.radiant[0].playerId, 'real');
  assert.equal(match.mvpId, 'real');

  const room = replacePlayerIdInRoom({
    signups: ['temp'], waitlist: [], rotationQueue: ['temp'],
    teams: { radiant: { players: [{ id: 'temp' }] }, dire: { players: [] } },
    votes: { mvp: { temp: 'p2', voter: 'temp' }, touch: {} },
    honors: { mvp: { playerId: 'temp' }, touch: null }
  }, 'temp', 'real');
  assert.deepEqual(room.signups, ['real']);
  assert.equal(room.teams.radiant.players[0].id, 'real');
  assert.equal(room.votes.mvp.real, 'p2');
  assert.equal(room.votes.mvp.voter, 'real');
  assert.equal(room.honors.mvp.playerId, 'real');
});

test('merge rejects historical or active-team double participation', () => {
  assert.throws(() => assertMergeHasNoCollision([
    { id: 'm1', participantIds: ['temp', 'real'] }
  ], null, 'temp', 'real'), /同一场历史比赛/);
  assert.throws(() => assertMergeHasNoCollision([], {
    teams: { radiant: { players: [{ id: 'temp' }] }, dire: { players: [{ id: 'real' }] } }
  }, 'temp', 'real'), /当前分队/);
});
```

- [ ] **Step 4: Run the new test and verify RED**

Run:

```bash
node --test tests/playerIdentity.test.js
```

Expected: FAIL because `cloudfunctions/api/playerIdentity.js` does not exist.

- [ ] **Step 5: Implement the pure identity module**

Implement `canonicalAccountId` using Steam64 offset `76561197960265728n`. Build a canonical ownership map from `steamIdsForPlayer`, reject multiple owners, group bindings per selected player, and deduplicate merge requests by `temporaryPlayerId -> targetPlayerId`.

Use these exact returned shapes. Compute `status` from merge pairs absent from the normalized approval-key set; do not expose an internal `approved` flag:

```js
{
  status: pendingMergeKeys.length ? 'merge_required' : 'ready',
  bindings: [{ playerId: 'target', accountIds: ['12345'] }],
  merges: [{ temporaryPlayerId, temporaryName, targetPlayerId, targetName, accountIds }]
}
```

`replacePlayerIdInMatch` must update `participantIds`, `winnerIds`, `plannedParticipantIds`, `radiant[].playerId`, `dire[].playerId`, `mvpId`, and `pressureId`. `replacePlayerIdInRoom` must update `signups`, `waitlist`, `rotationQueue`, both team player `id` fields, vote voter keys and target values, and honor `playerId` values; all replaced arrays must be deduplicated while retaining order.

- [ ] **Step 6: Run identity tests and commit**

Run:

```bash
node --test tests/playerIdentity.test.js tests/temporaryPlayer.test.js
```

Expected: PASS with zero failures.

Commit:

```bash
git add cloudfunctions/api/playerIdentity.js cloudfunctions/api/temporaryPlayer.js tests/playerIdentity.test.js
git commit -m "feat: define Steam identity merge rules"
```

### Task 2: Transactional Identity Service And Settlement

**Files:**
- Create: `cloudfunctions/api/playerIdentityService.js`
- Modify: `cloudfunctions/api/matchSettlement.js`
- Create: `tests/playerIdentityService.test.js`
- Modify: `tests/matchSettlement.test.js`

**Interfaces:**
- Consumes: `buildSteamBindingPlan` and migration helpers from Task 1.
- Produces: `createPlayerIdentityService({ db })` with `preflightPreview(preview, approvals)`, `applyPreviewIdentity(writer, preview, approvals)`, and `updatePlayerSteamIds(targetPlayerId, requestedIds, approvals)`.
- `settleImportedMatch(preview, metadata, { db })` consumes `metadata.mergeApprovals` and atomically applies approved merges, account-ID bindings, scoring, and match creation.

- [ ] **Step 1: Write service tests for preflight, migration, and idempotency**

Create a transaction-capable in-memory database fixture containing `players`, `matches`, and a `rooms/today` document. Add tests with these outcomes:

```js
test('preflight returns merge_required without database writes', async () => {
  const before = structuredClone(state);
  const result = await service.preflightPreview(preview, []);
  assert.equal(result.status, 'merge_required');
  assert.equal(result.merges[0].temporaryPlayerId, 'temp');
  assert.deepEqual(state, before);
});

test('approved identity application migrates history room and player once', async () => {
  await db.runTransaction((transaction) => service.applyPreviewIdentity(
    transaction,
    preview,
    [{ temporaryPlayerId: 'temp', targetPlayerId: 'real' }]
  ));
  assert.equal(state.players.temp, undefined);
  assert.equal(state.players.real.points, 7);
  assert.deepEqual(state.matches.old.participantIds, ['real', 'p2']);
  assert.deepEqual(state.rooms.today.signups, ['real']);

  const second = await service.preflightPreview(preview, [
    { temporaryPlayerId: 'temp', targetPlayerId: 'real' }
  ]);
  assert.equal(second.status, 'ready');
  assert.equal(state.players.real.points, 7);
});

test('permanent conflict leaves the transaction unchanged', async () => {
  const before = structuredClone(state);
  await assert.rejects(
    db.runTransaction((transaction) => service.applyPreviewIdentity(transaction, preview, [])),
    /已绑定正式选手/
  );
  assert.deepEqual(state, before);
});
```

- [ ] **Step 2: Run service tests and verify RED**

Run:

```bash
node --test tests/playerIdentityService.test.js
```

Expected: FAIL because `createPlayerIdentityService` is not defined.

- [ ] **Step 3: Implement the database service**

`preflightPreview` loads up to 100 player cards and returns `buildSteamBindingPlan` without writes. `applyPreviewIdentity` must:

1. Load fresh players, matches, and `rooms/today` through the transaction writer.
2. Rebuild the ownership plan from fresh documents.
3. Throw if the plan still requires an unapproved merge.
4. For each approved merge, run collision checks, update affected match and room documents, update the permanent player with `mergePlayerData`, and remove the temporary player.
5. Apply grouped account-ID bindings to the post-merge target documents.
6. Return the post-merge player list for settlement snapshots and scoring.

Use exact no-approval response objects from `preflightPreview`; do not encode merge requirements in error strings.

`updatePlayerSteamIds` first performs a no-write ownership preflight. If a merge is required, return that response. Otherwise run a transaction, apply approved merges, then set the target's normalized requested IDs plus all IDs inherited from merged temporary cards. Return `{ status: 'updated', player }`.

- [ ] **Step 4: Add settlement RED tests**

Extend `previewFixture()` rows in `tests/matchSettlement.test.js` with `accountId`. Add:

```js
test('settlement atomically binds account ids with scoring', async () => {
  const preview = previewFixture();
  const state = transactionState(preview);
  await executeSettlement(preview, { players: playersFor(preview) }, createTransactionDb(state));
  assert.deepEqual(state.players['doc-1'].steamIds, ['1']);
  assert.equal(state.players['doc-1'].matches, 4);
  assert.ok(state.matches['imported-7002']);
});

test('duplicate match does not add a new Steam binding', async () => {
  const preview = previewFixture();
  const state = transactionState(preview, {
    matches: { 'imported-7002': { _id: 'imported-7002', id: 'imported-7002' } }
  });
  await assert.rejects(executeSettlement(preview, {}, createTransactionDb(state)), /已经导入/);
  assert.deepEqual(state.players['doc-1'].steamIds || [], []);
});
```

- [ ] **Step 5: Refactor settlement so identity changes occur inside its transaction**

Move `buildSettlement(preview, players, metadata)` inside `persist(writer)`, after the duplicate-match check and after:

```js
const identityService = createPlayerIdentityService({ db });
const transactionPlayers = await identityService.applyPreviewIdentity(
  writer,
  preview,
  metadata.mergeApprovals || []
);
const settlement = buildSettlement(preview, transactionPlayers, metadata);
```

Keep the existing narrow non-transaction test fallback. Ensure the test writer implements `remove()` and collection reads required by the identity service.

- [ ] **Step 6: Run transaction tests and commit**

Run:

```bash
node --test tests/playerIdentityService.test.js tests/matchSettlement.test.js
```

Expected: PASS with zero failures, including rollback after a simulated write failure.

Commit:

```bash
git add cloudfunctions/api/playerIdentityService.js cloudfunctions/api/matchSettlement.js tests/playerIdentityService.test.js tests/matchSettlement.test.js
git commit -m "feat: merge Steam identities transactionally"
```

### Task 3: Wire Both Imported-Match Confirmation Routes

**Files:**
- Modify: `cloudfunctions/api/index.js:947-966,1068-1078,1129-1133`
- Modify: `cloudfunctions/api/leagueSyncApi.js:508-571`
- Modify: `utils/cloudStore.js:311-316,360-370`
- Modify: `pages/match/match.js:303-326,451-485`
- Create: `utils/temporaryMergePrompt.js`
- Modify: `tests/adminMatchResult.test.js`
- Modify: `tests/leagueSyncApi.test.js`
- Modify: `tests/leagueSyncUi.test.js`
- Create: `tests/temporaryMergePrompt.test.js`

**Interfaces:**
- Consumes: identity service preflight response `{ status: 'merge_required', merges }`.
- Produces: both confirm APIs accept `mergeApprovals: Array<{ temporaryPlayerId, targetPlayerId }>` and return the preflight response before settlement when approval is missing.
- Produces client helpers `buildTemporaryMergeMessage(merges)` and `approvalsFromMerges(merges)`.

- [ ] **Step 1: Write prompt-helper tests**

```js
test('temporary merge prompt names every source and target', () => {
  assert.equal(buildTemporaryMergeMessage([{
    temporaryName: '临时 A', targetName: '正式 B', accountIds: ['12345']
  }]), '临时选手“临时 A”将合并到正式选手“正式 B”（Steam ID 12345）。是否继续？');
});

test('merge approvals contain ids only', () => {
  assert.deepEqual(approvalsFromMerges([{
    temporaryPlayerId: 'temp', temporaryName: '临时',
    targetPlayerId: 'real', targetName: '正式', accountIds: ['12345']
  }]), [{ temporaryPlayerId: 'temp', targetPlayerId: 'real' }]);
});
```

- [ ] **Step 2: Add API and UI source-contract tests**

Update existing tests to require:

```js
assert.match(confirmBlock, /mergeApprovals/);
assert.match(confirmBlock, /preflightPreview/);
assert.match(cloudSource, /event\.mergeApprovals \|\| \[\]/);
assert.match(pageSource, /buildTemporaryMergeMessage/);
assert.match(pageSource, /approvalsFromMerges/);
```

In `tests/leagueSyncApi.test.js`, inject an identity service stub through `createLeagueSyncApi` and prove a `merge_required` preflight returns before `settleImportedMatch`, while approved input reaches settlement metadata as `mergeApprovals`.

- [ ] **Step 3: Run route tests and verify RED**

Run:

```bash
node --test tests/temporaryMergePrompt.test.js tests/adminMatchResult.test.js tests/leagueSyncApi.test.js tests/leagueSyncUi.test.js
```

Expected: FAIL because the routes do not accept approvals or return merge preflights.

- [ ] **Step 4: Wire cloud routes**

Create one `playerIdentityService` in `cloudfunctions/api/index.js` and pass it into `createLeagueSyncApi`. Change manual confirmation to:

```js
async function confirmImportedMatch(openid, matchId, radiantPlayerIds, direPlayerIds, mergeApprovals = []) {
  assertAdmin(openid, '只有管理员可以导入比赛结果');
  // Load preview, players, selected IDs, and reconciled preview as today.
  const identityPreflight = await playerIdentityService.preflightPreview(reconciled, mergeApprovals);
  if (identityPreflight.status === 'merge_required') return identityPreflight;
  return settleImportedMatch(reconciled, {
    source: 'manual-import',
    players,
    plannedParticipantIds,
    mergeApprovals
  }, { db });
}
```

Apply the same preflight in `confirmLeagueSyncMatch`; pass approvals to settlement metadata. Do not change background auto-processing behavior.

- [ ] **Step 5: Wire the match page confirmation retry**

Add optional `mergeApprovals = []` to both `utils/cloudStore.js` confirm functions and send it to cloud. In both page handlers:

1. Call the existing confirm action.
2. If `result.status !== 'merge_required'`, keep the existing success flow.
3. If merge is required, hide loading, show `wx.showModal` with the shared prompt, and on confirmation call the same handler's private submit method with `approvalsFromMerges(result.merges)`.
4. Cancellation performs no reload and no write.

- [ ] **Step 6: Run route tests and commit**

Run:

```bash
node --test tests/temporaryMergePrompt.test.js tests/adminMatchResult.test.js tests/leagueSyncApi.test.js tests/leagueSyncUi.test.js
```

Expected: PASS with zero failures.

Commit:

```bash
git add cloudfunctions/api/index.js cloudfunctions/api/leagueSyncApi.js utils/cloudStore.js pages/match/match.js utils/temporaryMergePrompt.js tests/adminMatchResult.test.js tests/leagueSyncApi.test.js tests/leagueSyncUi.test.js tests/temporaryMergePrompt.test.js
git commit -m "feat: bind Steam IDs from imported matches"
```

### Task 4: Administrator Steam ID Management

**Files:**
- Modify: `cloudfunctions/api/index.js`
- Modify: `utils/cloudStore.js`
- Modify: `pages/room/room.js`
- Modify: `pages/room/room.wxml`
- Modify: `pages/room/room.wxss`
- Modify: `tests/adminSettings.test.js`
- Create: `tests/adminSteamIdentity.test.js`

**Interfaces:**
- Consumes: `playerIdentityService.updatePlayerSteamIds(targetPlayerId, requestedIds, approvals)` from Task 2.
- Produces: protected cloud action `adminUpdatePlayerSteamIds`; client wrapper with the same name; room state field `adminSteamIds`.

- [ ] **Step 1: Add authorization and update source-contract tests**

Create `tests/adminSteamIdentity.test.js`:

```js
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../cloudfunctions/api/index.js'), 'utf8');

test('administrator Steam ID action is protected and forwards merge approvals', () => {
  const start = source.indexOf('async function adminUpdatePlayerSteamIds');
  const end = source.indexOf('async function adminSwapTeams', start);
  const block = source.slice(start, end);
  assert.notEqual(start, -1);
  assert.match(block, /assertAdmin\(openid, '只有管理员可以修改选手 Steam ID'\)/);
  assert.match(block, /playerIdentityService\.updatePlayerSteamIds/);
  assert.match(block, /mergeApprovals/);
  assert.match(source, /action === 'adminUpdatePlayerSteamIds'/);
  assert.match(source, /event\.mergeApprovals \|\| \[\]/);
});
```

Behavioral authorization, conflict, merge-required, and updated-result assertions stay in `tests/playerIdentityService.test.js`; this source test proves the public cloud action cannot bypass the protected service.

- [ ] **Step 2: Extend administrator-page source tests**

Add assertions to `tests/adminSettings.test.js`:

```js
assert.match(view, /class="admin-steam-editor"/);
assert.match(view, /bindinput="onAdminSteamIdsInput"/);
assert.match(view, /bindtap="saveAdminPlayerSteamIds"/);
assert.match(page, /adminUpdatePlayerSteamIds/);
assert.match(page, /buildTemporaryMergeMessage/);
```

- [ ] **Step 3: Run admin tests and verify RED**

Run:

```bash
node --test tests/adminSteamIdentity.test.js tests/adminSettings.test.js
```

Expected: FAIL because the cloud action and controls do not exist.

- [ ] **Step 4: Add the protected cloud and client actions**

In `cloudfunctions/api/index.js`:

```js
async function adminUpdatePlayerSteamIds(openid, playerId, steamIds, mergeApprovals = []) {
  assertAdmin(openid, '只有管理员可以修改选手 Steam ID');
  const targetId = String(playerId || '').trim();
  if (!targetId) throw new Error('请选择选手');
  return playerIdentityService.updatePlayerSteamIds(targetId, steamIds, mergeApprovals);
}
```

Route `action === 'adminUpdatePlayerSteamIds'` with `event.steamIds || []` and `event.mergeApprovals || []`. Add the corresponding `utils/cloudStore.js` wrapper and clear bootstrap cache only after `status === 'updated'`.

- [ ] **Step 5: Add the compact administrator editor**

Use the existing administrator player picker. Add `adminSteamIds` to page data, populate it from the selected player's `steamIds` or `steamId`, and update it whenever `onAdminPlayerChange` runs.

Add below the score save button:

```xml
<view class="admin-steam-editor">
  <view class="section-title">选手 Steam ID 管理</view>
  <input class="input" value="{{adminSteamIds}}" bindinput="onAdminSteamIdsInput" placeholder="多个 ID 用逗号或空格分隔" />
  <button class="primary-btn" bindtap="saveAdminPlayerSteamIds" disabled="{{!adminPlayerId}}">保存 Steam ID</button>
</view>
```

`saveAdminPlayerSteamIds` calls the wrapper. On `merge_required`, show the shared modal and retry with generated approvals. On `updated`, reload the room and show `Steam ID 已更新`.

Add only spacing and border rules matching `.admin-score-editor`; do not create a new card.

- [ ] **Step 6: Run admin tests and commit**

Run:

```bash
node --test tests/adminSteamIdentity.test.js tests/adminSettings.test.js tests/temporaryMergePrompt.test.js
```

Expected: PASS with zero failures.

Commit:

```bash
git add cloudfunctions/api/index.js utils/cloudStore.js pages/room/room.js pages/room/room.wxml pages/room/room.wxss tests/adminSettings.test.js tests/adminSteamIdentity.test.js
git commit -m "feat: let administrators manage Steam IDs"
```

### Task 5: Full Regression And Deployment Notes

**Files:**
- Create: `docs/deployment.md`
- Test: all `tests/*.test.js`

**Interfaces:**
- Consumes: completed cloud and mini-program changes from Tasks 1-4.
- Produces: deployment instructions identifying the cloud function and mini-program package that must be uploaded.

- [ ] **Step 1: Add deployment instructions**

Append a section explaining:

```markdown
## Steam Identity Binding Update

After deploying this version:

1. Upload and deploy `cloudfunctions/api` with cloud dependencies installed.
2. Compile and upload the mini program so match confirmation and administrator merge prompts use the new API contract.
3. `cloudfunctions/leagueSync` does not need redeployment because it calls the shared `api` cloud function.
4. No collection or index must be created manually; identity merges use the existing `players`, `matches`, and `rooms` collections.
```

- [ ] **Step 2: Run focused behavior suites**

Run:

```bash
node --test tests/playerIdentity.test.js tests/playerIdentityService.test.js tests/matchSettlement.test.js tests/adminMatchResult.test.js tests/leagueSyncApi.test.js tests/adminSteamIdentity.test.js tests/adminSettings.test.js tests/leagueSyncUi.test.js tests/temporaryMergePrompt.test.js
```

Expected: PASS with zero failures.

- [ ] **Step 3: Run the complete project suite**

Run:

```bash
node --test
```

Expected: all tests PASS with zero failed, cancelled, skipped, or todo tests.

- [ ] **Step 4: Inspect scope and encoding**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only planned source, test, and documentation files are modified; `assets/` remains untracked and unstaged.

- [ ] **Step 5: Commit deployment notes**

```bash
git add docs/deployment.md
git commit -m "docs: document Steam identity deployment"
```
