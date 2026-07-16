# Actual Match Lineup Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settle manual and imported matches from an administrator-confirmed actual ten-player lineup, with temporary cards for unexpected substitutes.

**Architecture:** Add pure lineup and temporary-card helpers, then keep database orchestration in the existing cloud function. Both manual and imported settlement submit ordered Radiant and Dire player IDs, validate before any writes, and reuse the current scoring and rollback fields. The match page owns lineup editing and temporary-card creation.

**Tech Stack:** Native WeChat mini program, Node.js CommonJS cloud function, CloudBase document database, Node test runner.

## Global Constraints

- Every settled match has exactly five unique Radiant and five unique Dire player cards.
- Signup and planned teams never determine scoring after an actual lineup is submitted.
- Scoring remains winner `+2`, loser `-1`, scoring version `3`.
- Existing history deletion must reverse the actual lineup.
- Only administrators may create temporary cards or settle results.
- Temporary cards start with zero competition statistics and self-rating `80`.
- No destructive startup migration or automatic historical rewrite.

---

### Task 1: Actual Lineup Domain Helpers

**Files:**
- Create: `utils/actualLineup.js`
- Create: `tests/actualLineup.test.js`

**Interfaces:**
- `resolveActualLineup(players, radiantIds, direIds)` returns ordered player objects and snapshots.
- `applyActualLineupToPreview(preview, radiantIds, direIds, players)` replaces API player assignments while preserving KDA.

- [ ] Write failing tests for exactly five per side, duplicate rejection, missing-card rejection, non-signup acceptance, and imported assignment overrides.
- [ ] Run `node --test tests\actualLineup.test.js` and verify failures are caused by the missing module.
- [ ] Implement normalization, validation, score totals, snapshots, participant IDs, and winner-side helpers without database access.
- [ ] Run the focused tests and verify all pass.
- [ ] Commit with `feat: add actual lineup reconciliation helpers`.

### Task 2: Temporary Player Cards and Claiming

**Files:**
- Create: `utils/temporaryPlayer.js`
- Create: `tests/temporaryPlayer.test.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `utils/cloudStore.js`

**Interfaces:**
- `buildTemporaryPlayer({ id, name, steamIds })` produces a selectable zero-stat card.
- `findClaimableTemporaryPlayer(players, steamIds)` returns one unclaimed matching temporary card or `null`.
- Cloud action `adminCreateTemporaryPlayer` accepts `{ name, steamId }`.

- [ ] Write failing tests for zero statistics, all-position preference, duplicate Steam ownership rejection, and matching-Steam claim selection.
- [ ] Verify focused tests fail before implementation.
- [ ] Implement pure temporary-card helpers.
- [ ] Add administrator-only cloud creation with stable `temp-<timestamp>-<random>` IDs.
- [ ] Change current-player lookup to prefer `openid`, allowing a claimed temporary card to retain its stable player ID.
- [ ] On profile save, claim an unclaimed temporary card with the same normalized Steam account ID, copy profile fields, preserve statistics, and remove only the empty auto-created placeholder.
- [ ] Add client wrapper and local fallback for temporary-card creation.
- [ ] Run focused and identity tests.
- [ ] Commit with `feat: add claimable temporary player cards`.

### Task 3: Cloud Settlement Uses Actual Lineups

**Files:**
- Modify: `cloudfunctions/api/index.js`
- Modify: `utils/manualMatchResult.js`
- Modify: `utils/matchImport.js`
- Modify: `utils/cloudStore.js`
- Modify: `tests/manualMatchResult.test.js`
- Modify: `tests/matchImport.test.js`
- Modify: `tests/adminMatchResult.test.js`

**Interfaces:**
- `recordMatchResult(winnerSide, radiantPlayerIds, direPlayerIds)`.
- `confirmImportedMatch(matchId, radiantPlayerIds, direPlayerIds)`.

- [ ] Write failing tests proving manual settlement ignores planned room teams when an actual lineup is supplied.
- [ ] Write failing tests proving imported settlement overrides automatic Steam matching and requires ten resolved unique cards.
- [ ] Verify the tests fail against current behavior.
- [ ] Resolve and validate all ten cards before player updates.
- [ ] Store `lineupSource`, `plannedParticipantIds`, actual snapshots, `participantIds`, and `winnerIds`.
- [ ] Preserve KDA and hero fields on imported snapshots.
- [ ] Ensure failures occur before points, wins, matches, or history writes.
- [ ] Update client and local fallback signatures.
- [ ] Run focused scoring, detail, and rollback tests.
- [ ] Commit with `feat: settle matches from actual lineups`.

### Task 4: Match Page Reconciliation UI

**Files:**
- Modify: `pages/match/match.js`
- Modify: `pages/match/match.wxml`
- Modify: `pages/match/match.wxss`
- Create: `tests/matchLineupUi.test.js`

**Interfaces:**
- Page data contains `playerOptions`, `actualRadiantIds`, `actualDireIds`.
- Imported preview rows contain `selectedPlayerId` aligned by side and row index.

- [ ] Write failing structure tests for ten manual pickers, imported correction pickers, and administrator temporary-card controls.
- [ ] Verify tests fail against the existing page.
- [ ] Initialize manual actual lineups from current teams without overwriting administrator edits.
- [ ] Add five Radiant and five Dire player pickers sourced from all player cards.
- [ ] Pass actual arrays when recording either winner.
- [ ] Decorate imported rows with selected card IDs and add correction pickers.
- [ ] Add per-row temporary-card creation prefilled with API account ID and a general manual temporary-card action.
- [ ] Refresh players after card creation and select the returned card in the intended slot.
- [ ] Keep controls administrator-only and retain ordinary-member warning behavior.
- [ ] Run UI and page syntax tests.
- [ ] Commit with `feat: add match lineup reconciliation UI`.

### Task 5: Full Compatibility Verification

**Files:**
- Verify all changed files.

- [ ] Run the complete suite with:

```powershell
C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test
```

- [ ] Run syntax checks for all changed JavaScript files.
- [ ] Run `git diff --check`, BOM scan, mojibake scan, and 32-character secret scan.
- [ ] Confirm old imported and manual records still render and delete correctly.
- [ ] Confirm no bootstrap code deletes or rewrites matches or player statistics.
- [ ] Review the final diff for unrelated changes.
- [ ] Record deployment requirement: redeploy `cloudfunctions/api` with cloud-side dependency installation, then recompile the mini program.
