# Admin Pigeon Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the configured WeChat users reliably see the admin panel and ensure only administrators can record pigeon counts.

**Architecture:** Keep UI visibility driven by the bootstrap `openid` and `isAdmin` fields, with a local configured-list fallback. Move cloud administrator checks into a small pure module so tests can verify both configured OpenIDs and protect `markPigeons` before any database write.

**Tech Stack:** Native WeChat Mini Program, WeChat Cloud Functions, CommonJS, Node.js built-in test runner.

## Global Constraints

- Keep the root-level mini-program structure; do not create a nested `miniprogram/` directory.
- Save JS, WXML, WXSS, JSON, and Markdown as UTF-8 without BOM.
- Only administrators can see or invoke signup reset and pigeon recording.
- Both administrator OpenIDs currently configured in `utils/config.js` must be recognized by the cloud function.

---

### Task 1: Cloud Administrator Authorization

**Files:**
- Create: `cloudfunctions/api/adminAuth.js`
- Create: `tests/adminPermissions.test.js`
- Modify: `cloudfunctions/api/index.js`
- Read for comparison: `utils/config.js`

**Interfaces:**
- Produces: `ADMIN_OPENIDS: string[]`, `isAdminOpenid(openid: string): boolean`, `assertAdmin(openid: string, message?: string): void`.
- Consumes: `wxContext.OPENID` from the cloud-function invocation.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const clientConfig = require('../utils/config');
const { ADMIN_OPENIDS, isAdminOpenid, assertAdmin } = require('../cloudfunctions/api/adminAuth');

test('cloud and client use the same administrator openids', () => {
  assert.deepEqual(ADMIN_OPENIDS, clientConfig.adminOpenids);
});

test('both configured administrators are recognized', () => {
  clientConfig.adminOpenids.forEach((openid) => assert.equal(isAdminOpenid(openid), true));
});

test('non administrator is rejected before protected writes', () => {
  assert.throws(() => assertAdmin('ordinary-player'), /只有管理员/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/adminPermissions.test.js`

Expected: FAIL because `cloudfunctions/api/adminAuth.js` does not exist.

- [ ] **Step 3: Add the pure authorization module**

```js
const ADMIN_OPENIDS = [
  'ouIhh3OLQF1kavr5Y75T8x9QzMJk',
  'o6zAJszkWm_0D63PwmVC2hCZw_Yc'
];

function isAdminOpenid(openid) {
  return ADMIN_OPENIDS.includes(String(openid || ''));
}

function assertAdmin(openid, message = '只有管理员可以操作') {
  if (!isAdminOpenid(openid)) {
    throw new Error(message);
  }
}

module.exports = { ADMIN_OPENIDS, isAdminOpenid, assertAdmin };
```

- [ ] **Step 4: Protect cloud writes at their source**

Import `isAdminOpenid` and `assertAdmin` in `cloudfunctions/api/index.js`. Change `markPigeons` to `markPigeons(openid, pigeonIds)`, call `assertAdmin(openid, '只有管理员可以记录鸽子')` before reading or writing collections, and dispatch it with `markPigeons(openid, event.pigeonIds || [])`. Reuse `assertAdmin` in `resetRoomSignups` with its existing message.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test tests/adminPermissions.test.js`

Expected: 3 tests pass.

- [ ] **Step 6: Commit the authorization change**

```bash
git add cloudfunctions/api/adminAuth.js cloudfunctions/api/index.js tests/adminPermissions.test.js
git commit -m "fix: enforce admin pigeon permissions"
```

### Task 2: Room Page Visibility and Encoding Repair

**Files:**
- Modify: `pages/room/room.js`
- Modify: `pages/room/room.wxml`
- Modify: `tests/adminRoom.test.js`

**Interfaces:**
- Consumes: bootstrap `{ openid, isAdmin, currentPlayer, room, players }`.
- Produces: page data `isAdmin: boolean`; admin-only handlers `resetSignups()` and `markPigeons()`.

- [ ] **Step 1: Add failing source-contract tests**

Add tests that read `pages/room/room.wxml` and assert it contains `wx:if="{{isAdmin}}"` for the administrator panel and `wx:if="{{isAdmin && pigeonCandidates.length}}"` for pigeon statistics. Add a test that both configured OpenIDs pass `isAdminOpenid`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/adminRoom.test.js`

Expected: FAIL because pigeon statistics are currently only gated by `pigeonCandidates.length`.

- [ ] **Step 3: Rewrite the corrupted room JavaScript as clean UTF-8**

Preserve current signup, waitlist, start-time, balancing, reset, and pigeon behavior. Keep `resolveAdmin(data)` using `data.isAdmin`, `data.currentPlayer.isAdmin`, and configured OpenID fallback. Add an early `if (!this.data.isAdmin)` guard to both protected handlers with the toast `只有管理员可以操作`.

- [ ] **Step 4: Rewrite the corrupted room WXML as clean UTF-8**

Restore all Chinese labels and valid closing tags. Show a compact administrator panel only for `isAdmin`. Gate pigeon statistics with `wx:if="{{isAdmin && pigeonCandidates.length}}"`; ordinary users continue to see player pigeon totals but no editing controls.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test tests/adminRoom.test.js tests/adminPermissions.test.js`

Expected: all administrator and visibility tests pass.

- [ ] **Step 6: Commit the room-page repair**

```bash
git add pages/room/room.js pages/room/room.wxml tests/adminRoom.test.js
git commit -m "fix: show admin tools and hide pigeon controls"
```

### Task 3: Full Verification

**Files:**
- Verify: all project JavaScript, WXML, WXSS, JSON, and tests.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: deployable root mini-program and `cloudfunctions/api` package.

- [ ] **Step 1: Run all unit tests**

Run: `node --test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Check JavaScript syntax**

Run `node --check` against every project `.js` file except `node_modules`.

Expected: no syntax errors.

- [ ] **Step 3: Scan for encoding corruption and BOMs**

Search source files for replacement characters and known mojibake markers, then inspect the first three bytes of JS, WXML, WXSS, JSON, and Markdown files.

Expected: no garbled markers and no UTF-8 BOM files.

- [ ] **Step 4: Confirm deployment handoff**

In WeChat Developer Tools, upload and deploy `cloudfunctions/api` with cloud dependencies, clear the mini-program cache, and compile again. The configured administrator must see both administrator sections; a normal WeChat user must see neither and must receive an authorization error if the cloud action is invoked directly.
