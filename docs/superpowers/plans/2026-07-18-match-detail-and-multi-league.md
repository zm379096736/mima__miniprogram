# Match Detail and Multi-League Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add frozen self-rating lineups, rich imported match details with safe historical repair, Chinese hero presentation, and automatic sync for leagues 20040 and 19608.

**Architecture:** Keep scoring settlement separate from display-data repair. Store durable player display snapshots at match creation, decorate hero IDs through a generated static metadata module, and extend the existing queue so every discovered match carries league metadata. Use OpenDota for detail first, Valve as the existing fallback, and Valve league history plus a deterministic seed to discover Fiji Cup matches missing from OpenDota's league list.

**Tech Stack:** WeChat native mini program, CommonJS JavaScript, CloudBase cloud functions and database, Node.js built-in test runner, OpenDota API, Valve Steam Web API.

## Global Constraints

- Win/loss scoring remains exactly `+2` for a win and `-1` for a loss.
- Self-rating remains separate from leaderboard points and is only used for lineup display and team totals.
- Historical detail repair must never update points, matches, wins, winner IDs, or participant IDs.
- Imported match ID remains the idempotency key across all discovery sources.
- Hero portraits must remain outside the mini program package to preserve the 2 MB upload limit.
- Steam API credentials stay in cloud-function environment variables and never enter client data.
- Existing untracked `assets/` league artwork must not be added to feature commits.
- All new text files use UTF-8 without BOM.

## File Map

- `utils/dotaHeroes.js`: generated static hero ID to Chinese name/image URL metadata.
- `scripts/generateDotaHeroes.js`: one-shot generator using Valve's Chinese hero datafeed.
- `utils/actualLineup.js`: client/local lineup snapshots and self-rating totals.
- `cloudfunctions/api/actualLineup.js`: authoritative cloud lineup snapshots and totals.
- `cloudfunctions/api/matchSettlement.js`: imported-match display snapshots and league metadata.
- `cloudfunctions/api/matchDetailRepair.js`: pure, scoring-free merge for historical imported details.
- `cloudfunctions/api/index.js`: cloud actions, source loading, and repair persistence.
- `cloudfunctions/api/leagueConfig.js`: supported league definitions and Fiji seed IDs.
- `cloudfunctions/api/leagueSyncApi.js`: queue metadata, settlement metadata, and Valve discovery action.
- `cloudfunctions/api/leagueSyncState.js`: safe queue/state serialization for multiple leagues.
- `cloudfunctions/leagueSync/runner.js`: orchestrates discovery for every configured league.
- `cloudfunctions/leagueSync/index.js`: OpenDota list fetches and internal Valve discovery call.
- `utils/matchDetail.js`: detail repair detection and hero/player display decoration.
- `utils/playerMatchStats.js`: hero metadata in profile summaries and recent matches.
- `utils/cloudStore.js`: client repair API and match-avatar URL resolution.
- `pages/match/match.js`, `pages/match/match.wxml`, `pages/match/match.wxss`: lineup and history totals UI.
- `pages/match-detail/*`: rich imported/manual detail UI and one-time repair call.
- `pages/profile/*`: Chinese hero name and portrait UI.
- `tests/*.test.js`: unit, integration, UI-source, idempotency, and package tests.

---

### Task 1: Freeze Manual Lineup Display Data and Team Totals

**Files:**
- Modify: `utils/actualLineup.js`
- Modify: `cloudfunctions/api/actualLineup.js`
- Modify: `utils/manualMatchResult.js`
- Modify: `cloudfunctions/api/index.js`
- Test: `tests/actualLineup.test.js`
- Test: `tests/manualMatchResult.test.js`
- Test: `tests/adminMatchResult.test.js`

**Interfaces:**
- Produces: `snapshotPlayer(player) -> { playerId, name, score, avatarUrl, temporary }`.
- Produces: `resolveActualLineup(...) -> { radiantScore, direScore, scoreGap, radiant, dire, ... }`.
- Consumed later by imported settlement and both match-detail views.

- [ ] **Step 1: Write failing snapshot and total tests**

Add player fixtures with `avatarUrl`, then assert:

```js
assert.equal(lineup.radiant[0].score, 70);
assert.equal(lineup.radiant[0].avatarUrl, 'cloud://env/avatars/p1.jpg');
assert.equal(lineup.radiantScore, 360);
assert.equal(lineup.direScore, 385);
assert.equal(lineup.scoreGap, 25);
```

For manual records assert `radiantScore` and `direScore` are copied into the record, not recalculated from leaderboard points.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/actualLineup.test.js tests/manualMatchResult.test.js tests/adminMatchResult.test.js`

Expected: FAIL because cloud snapshots omit `avatarUrl` and authoritative results omit one or both team totals.

- [ ] **Step 3: Add durable snapshot fields and totals**

Use the same implementation in client and cloud copies:

```js
function snapshotPlayer(player) {
  return {
    playerId: player.id,
    name: player.name,
    score: Number(player.score || 0),
    avatarUrl: String(player.avatarUrl || ''),
    temporary: Boolean(player.temporary)
  };
}
```

Return `radiantScore` and `direScore` from both `resolveActualLineup` implementations. Persist them in `buildManualMatchRecord` and `recordMatchResult` beside `scoreGap`.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `node --test tests/actualLineup.test.js tests/manualMatchResult.test.js tests/adminMatchResult.test.js`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/actualLineup.js cloudfunctions/api/actualLineup.js utils/manualMatchResult.js cloudfunctions/api/index.js tests/actualLineup.test.js tests/manualMatchResult.test.js tests/adminMatchResult.test.js
git commit -m "feat: snapshot manual lineup ratings and avatars"
```

### Task 2: Preserve Imported Player Display Snapshots and Economy Stats

**Files:**
- Modify: `cloudfunctions/api/actualLineup.js`
- Modify: `utils/actualLineup.js`
- Modify: `cloudfunctions/api/matchSettlement.js`
- Test: `tests/actualLineup.test.js`
- Test: `tests/matchSettlement.test.js`
- Test: `tests/matchImport.test.js`

**Interfaces:**
- Consumes: player snapshot fields from Task 1.
- Produces: every settled imported row contains API stats plus frozen `score` and `avatarUrl`.

- [ ] **Step 1: Write failing preservation tests**

Extend the reconciliation fixture with economy fields and avatar/self-rating data:

```js
goldPerMin: 640,
xpPerMin: 720
```

Assert after reconciliation and settlement:

```js
assert.equal(reconciled.radiant[0].goldPerMin, 640);
assert.equal(reconciled.radiant[0].xpPerMin, 720);
assert.equal(reconciled.radiant[0].score, 70);
assert.equal(reconciled.radiant[0].avatarUrl, 'cloud://env/avatars/p1.jpg');
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/actualLineup.test.js tests/matchSettlement.test.js tests/matchImport.test.js`

Expected: FAIL because reconciliation currently replaces identity fields without adding self-rating/avatar snapshots.

- [ ] **Step 3: Merge identity snapshots without replacing API fields**

Update `assign` in both actual-lineup modules:

```js
const assign = (apiPlayers, selectedPlayers) => (apiPlayers || []).map((apiPlayer, index) => ({
  ...apiPlayer,
  ...snapshotPlayer(selectedPlayers[index]),
  matched: true
}));
```

In `buildSettlement`, refresh `score`, `avatarUrl`, and `temporary` from the authoritative `players` map while retaining `heroId`, KDA, GPM, XPM, account ID, and slot from each preview row.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `node --test tests/actualLineup.test.js tests/matchSettlement.test.js tests/matchImport.test.js`

Expected: all focused tests PASS and API metrics remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add utils/actualLineup.js cloudfunctions/api/actualLineup.js cloudfunctions/api/matchSettlement.js tests/actualLineup.test.js tests/matchSettlement.test.js tests/matchImport.test.js
git commit -m "feat: preserve imported match player snapshots"
```

### Task 3: Generate Chinese Hero Metadata Outside the Image Package

**Files:**
- Create: `scripts/generateDotaHeroes.js`
- Create: `utils/dotaHeroes.js`
- Create: `tests/dotaHeroes.test.js`
- Modify: `utils/playerMatchStats.js`
- Modify: `tests/playerMatchStats.test.js`

**Interfaces:**
- Produces: `heroById(heroId) -> { id, name, slug, imageUrl }`.
- Produces: `decorateHero(target) -> target & { heroName, heroImage }`.
- Portrait base URL: `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/`.

- [ ] **Step 1: Write failing metadata and profile tests**

Create assertions:

```js
const { heroById } = require('../utils/dotaHeroes');
assert.deepEqual(heroById(39), {
  id: 39,
  name: '痛苦女王',
  slug: 'queenofpain',
  imageUrl: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/queenofpain.png'
});
assert.equal(heroById(999).name, '未知英雄 #999');
```

Update player-stat tests to expect `heroName` and `heroImage` in both `heroes` and `recentMatches`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/dotaHeroes.test.js tests/playerMatchStats.test.js`

Expected: FAIL because `utils/dotaHeroes.js` and decorated fields do not exist.

- [ ] **Step 3: Add the deterministic Valve datafeed generator**

The generator requests:

```js
const DATA_URL = 'https://www.dota2.com/datafeed/herolist?language=schinese';
```

For each `result.data.heroes` row, derive `slug` with:

```js
const slug = row.name.replace(/^npc_dota_hero_/, '');
```

Sort by numeric ID and emit a CommonJS module containing the static rows, `heroById`, and `decorateHero`. The generated runtime module performs no network requests.

- [ ] **Step 4: Generate metadata and implement profile decoration**

Run: `node scripts/generateDotaHeroes.js`

Expected: `utils/dotaHeroes.js` contains the current complete Valve hero list with Chinese names and slugs.

Update `buildRecentMatches` and `buildHeroSummary`:

```js
const hero = heroById(heroId);
return { ...existingFields, heroName: hero.name, heroImage: hero.imageUrl };
```

- [ ] **Step 5: Run focused tests and verify pass**

Run: `node --test tests/dotaHeroes.test.js tests/playerMatchStats.test.js`

Expected: all focused tests PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/generateDotaHeroes.js utils/dotaHeroes.js utils/playerMatchStats.js tests/dotaHeroes.test.js tests/playerMatchStats.test.js
git commit -m "feat: add Chinese Dota hero metadata"
```

### Task 4: Add Scoring-Free Historical Imported Detail Repair

**Files:**
- Create: `cloudfunctions/api/matchDetailRepair.js`
- Create: `tests/matchDetailRepair.test.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `utils/cloudStore.js`
- Modify: `utils/matchDetail.js`
- Modify: `tests/matchDetail.test.js`
- Modify: `tests/cloudStore.test.js`

**Interfaces:**
- Produces: `needsImportedDetailRepair(match) -> boolean`.
- Produces: `mergeImportedMatchDetails(storedMatch, freshPreview) -> repairedMatchFields`.
- Produces cloud action: `refreshImportedMatchDetail({ id }) -> updated match`.
- Produces client function: `refreshImportedMatchDetail(id) -> Promise<match>`.

- [ ] **Step 1: Write failing repair-invariant tests**

Use an old match with ten rows lacking metric fields and a fresh preview with populated metrics. Assert:

```js
assert.equal(needsImportedDetailRepair(oldMatch), true);
assert.equal(repaired.radiant[0].goldPerMin, 679);
assert.equal(repaired.radiant[0].xpPerMin, 1317);
assert.deepEqual(repaired.participantIds, oldMatch.participantIds);
assert.deepEqual(repaired.winnerIds, oldMatch.winnerIds);
assert.equal(repaired.scoringVersion, oldMatch.scoringVersion);
assert.equal(repaired.points, undefined);
```

Also assert a record with `detailsRefreshedAt` does not request repair, a legacy record whose ten rows explicitly contain only zero GPM/XPM does request repair, and missing metrics format as `--` rather than numeric zero. The detector returns true when an imported record has no repair marker and either a metric property is absent or all ten rows have nonpositive GPM/XPM.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/matchDetailRepair.test.js tests/matchDetail.test.js tests/cloudStore.test.js`

Expected: FAIL because the repair module and cloud/client action do not exist.

- [ ] **Step 3: Implement the pure slot-preserving merge**

Merge each side by index while keeping stored bindings:

```js
function mergeSide(storedRows, freshRows) {
  return storedRows.map((stored, index) => ({
    ...freshRows[index],
    ...stored,
    heroId: Number(freshRows[index] && freshRows[index].heroId || 0),
    kills: Number(freshRows[index] && freshRows[index].kills || 0),
    deaths: Number(freshRows[index] && freshRows[index].deaths || 0),
    assists: Number(freshRows[index] && freshRows[index].assists || 0),
    goldPerMin: Number(freshRows[index] && freshRows[index].goldPerMin || 0),
    xpPerMin: Number(freshRows[index] && freshRows[index].xpPerMin || 0)
  }));
}
```

The module returns only `radiant`, `dire`, `duration`, `startTime`, `radiantKills`, `direKills`, `detailsRefreshedAt`, and `detailSource`. It must not accept `db` and must not import settlement/scoring modules.

- [ ] **Step 4: Add the cloud action without settlement**

In `index.js`, load the stored record by its document ID, reject non-imported records, call the existing `loadMatchWithFallback`, build a fresh preview, merge allowed detail fields, and update that same document. Do not call `settleImportedMatch`.

Route:

```js
if (action === 'refreshImportedMatchDetail') {
  return refreshImportedMatchDetail(event.id);
}
```

- [ ] **Step 5: Add client detection and API wrapper**

Expose:

```js
async function refreshImportedMatchDetail(id) {
  const match = await callApi('refreshImportedMatchDetail', { id });
  clearCache();
  return match;
}
```

Use explicit `metricText` fields in `buildMatchDetail`: positive values become strings; missing/nonpositive legacy values become `--`.

- [ ] **Step 6: Run focused tests and verify pass**

Run: `node --test tests/matchDetailRepair.test.js tests/matchDetail.test.js tests/cloudStore.test.js`

Expected: all focused tests PASS, including the no-scoring invariant.

- [ ] **Step 7: Commit**

```bash
git add cloudfunctions/api/matchDetailRepair.js cloudfunctions/api/index.js utils/cloudStore.js utils/matchDetail.js tests/matchDetailRepair.test.js tests/matchDetail.test.js tests/cloudStore.test.js
git commit -m "fix: repair legacy imported match details safely"
```

### Task 5: Render Rich Manual and Imported Match Details

**Files:**
- Modify: `utils/matchDetail.js`
- Modify: `utils/cloudStore.js`
- Modify: `pages/match-detail/match-detail.js`
- Modify: `pages/match-detail/match-detail.wxml`
- Modify: `pages/match-detail/match-detail.wxss`
- Modify: `pages/match/match.js`
- Modify: `pages/match/match.wxml`
- Modify: `pages/match/match.wxss`
- Modify: `tests/matchDetail.test.js`
- Modify: `tests/matchLineupUi.test.js`

**Interfaces:**
- Consumes: hero metadata, frozen snapshots, totals, and repair action from Tasks 1-4.
- Produces: display rows with `avatarSrc`, `heroName`, `heroImage`, `gpmText`, and `xpmText`.

- [ ] **Step 1: Write failing UI-source and formatter tests**

Assert imported detail rows expose portrait/name/economy data and manual rows expose self-rating/avatar without KDA. Assert WXML contains image bindings:

```js
assert.match(view, /item\.heroImage/);
assert.match(view, /item\.avatarSrc/);
assert.match(view, /item\.gpmText/);
assert.match(view, /detail\.radiantScore/);
assert.match(view, /detail\.direScore/);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/matchDetail.test.js tests/matchLineupUi.test.js`

Expected: FAIL because portraits and explicit team totals are not rendered.

- [ ] **Step 3: Resolve snapshot avatars before rendering**

Add a cloud-store helper that collects durable `avatarUrl` values from match `radiant` and `dire` snapshots and resolves cloud file IDs through `wx.cloud.getTempFileURL`. Keep current-player fallback only when an old snapshot lacks `avatarUrl`.

- [ ] **Step 4: Trigger one repair attempt on detail load**

In `onLoad`, after bootstrap lookup:

```js
if (needsImportedDetailRepair(match)) {
  try {
    match = await refreshImportedMatchDetail(match.id);
  } catch (error) {
    // The saved record remains readable with unavailable metric placeholders.
  }
}
```

Resolve avatar sources and then call `buildMatchDetail`. The page performs at most one repair request per load.

- [ ] **Step 5: Implement compact team-row UI**

Imported rows show hero portrait, optional player avatar, hero/player names, KDA, GPM, XPM, and frozen self-rating. Manual rows show player avatar, name, assigned position, and frozen self-rating only. History cards label manual totals as `天辉自评` and `夜魇自评`.

On the administrator's actual-lineup selector, each candidate row also shows the player's current avatar and current self-rating before submission. Old manual detail rows fall back to the current player avatar/self-rating only when those frozen snapshot fields are absent.

- [ ] **Step 6: Run focused tests and verify pass**

Run: `node --test tests/matchDetail.test.js tests/matchLineupUi.test.js`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add utils/matchDetail.js utils/cloudStore.js pages/match-detail pages/match/match.js pages/match/match.wxml pages/match/match.wxss tests/matchDetail.test.js tests/matchLineupUi.test.js
git commit -m "feat: render rich match lineups and details"
```

### Task 6: Render Chinese Hero Summaries on the Profile Page

**Files:**
- Modify: `pages/profile/profile.wxml`
- Modify: `pages/profile/profile.wxss`
- Modify: `tests/profileMatchStatsUi.test.js`

**Interfaces:**
- Consumes: `heroName` and `heroImage` from Task 3.
- Produces: portrait-based recent hero and recent match rows.

- [ ] **Step 1: Write failing profile UI tests**

Assert the profile template uses metadata instead of raw labels:

```js
assert.match(view, /item\.heroImage/);
assert.match(view, /item\.heroName/);
assert.doesNotMatch(view, /英雄 \{\{item\.heroId\}\}/);
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test tests/profileMatchStatsUi.test.js`

Expected: FAIL because the page still renders raw hero IDs.

- [ ] **Step 3: Update profile hero and match rows**

Use `<image mode="aspectFill">` for portraits, render `item.heroName`, keep match count/win rate and KDA, and add a neutral background/error placeholder so failed remote images do not shift layout.

- [ ] **Step 4: Run focused tests and verify pass**

Run: `node --test tests/profileMatchStatsUi.test.js tests/playerMatchStats.test.js`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pages/profile/profile.wxml pages/profile/profile.wxss tests/profileMatchStatsUi.test.js
git commit -m "feat: show Chinese hero summaries on profile"
```

### Task 7: Extend Discovery and Queue Metadata to Both Leagues

**Files:**
- Create: `cloudfunctions/api/leagueConfig.js`
- Create: `tests/leagueConfig.test.js`
- Modify: `cloudfunctions/api/leagueSyncApi.js`
- Modify: `cloudfunctions/api/leagueSyncState.js`
- Modify: `cloudfunctions/api/matchSettlement.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `cloudfunctions/leagueSync/runner.js`
- Modify: `cloudfunctions/leagueSync/index.js`
- Modify: `tests/leagueSyncApi.test.js`
- Modify: `tests/leagueSyncFunction.test.js`
- Modify: `tests/matchSettlement.test.js`

**Interfaces:**
- Produces: `LEAGUES = [{ id: '20040', name: '秘马内战' }, { id: '19608', name: '斐济杯' }]`.
- Produces: `FIJI_SEED_MATCH_IDS = ['8900989622']`.
- Changes: `discoverLeagueMatches(token, payload, metadata)` stores `leagueId`, `leagueName`, and `discoverySource`.

- [ ] **Step 1: Write failing multi-league and idempotency tests**

Assert both league definitions exist, queue rows preserve metadata, the seed is inserted once, and settling metadata comes from the queue row rather than `DEFAULT_LEAGUE_ID`.

```js
assert.equal(row.leagueId, '19608');
assert.equal(row.leagueName, '斐济杯');
assert.equal(row.discoverySource, 'seed');
assert.equal(settlementMetadata.leagueId, '19608');
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/leagueConfig.test.js tests/leagueSyncApi.test.js tests/leagueSyncFunction.test.js tests/matchSettlement.test.js`

Expected: FAIL because league 20040 is hard-coded and queue rows do not carry league metadata.

- [ ] **Step 3: Add shared league configuration and metadata validation**

Create exact definitions:

```js
const LEAGUES = Object.freeze([
  Object.freeze({ id: '20040', name: '秘马内战' }),
  Object.freeze({ id: '19608', name: '斐济杯' })
]);
const FIJI_SEED_MATCH_IDS = Object.freeze(['8900989622']);
```

Validate metadata against this allowlist before writing queue rows.

- [ ] **Step 4: Thread metadata through queue and settlement**

Persist metadata on discovery, include it in `safeQueueRow`, and pass the current row values into `settleImportedMatch` in both automatic and administrator-review paths. Add `leagueName` to stored match metadata.

- [ ] **Step 5: Loop through OpenDota league lists and seeds**

Update the runner so one source failure is captured but does not stop later leagues. For each configured league call `fetchLeagueMatches(league.id)`, then `discoverLeagueMatches` with `discoverySource: 'opendota'`. Discover `8900989622` with Fiji metadata and `discoverySource: 'seed'`.

- [ ] **Step 6: Run focused tests and verify pass**

Run: `node --test tests/leagueConfig.test.js tests/leagueSyncApi.test.js tests/leagueSyncFunction.test.js tests/matchSettlement.test.js`

Expected: all focused tests PASS, including duplicate seed convergence.

- [ ] **Step 7: Commit**

```bash
git add cloudfunctions/api/leagueConfig.js cloudfunctions/api/leagueSyncApi.js cloudfunctions/api/leagueSyncState.js cloudfunctions/api/matchSettlement.js cloudfunctions/api/index.js cloudfunctions/leagueSync/runner.js cloudfunctions/leagueSync/index.js tests/leagueConfig.test.js tests/leagueSyncApi.test.js tests/leagueSyncFunction.test.js tests/matchSettlement.test.js
git commit -m "feat: support multiple automatic Dota leagues"
```

### Task 8: Add Valve Fiji Cup Discovery Fallback and Admin Labels

**Files:**
- Create: `cloudfunctions/api/valveLeagueHistory.js`
- Create: `tests/valveLeagueHistory.test.js`
- Modify: `cloudfunctions/api/index.js`
- Modify: `cloudfunctions/leagueSync/runner.js`
- Modify: `utils/leagueSyncView.js`
- Modify: `pages/match/match.wxml`
- Modify: `tests/leagueSyncFunction.test.js`
- Modify: `tests/leagueSyncUi.test.js`
- Modify: `tests/leagueSyncView.test.js`

**Interfaces:**
- Produces: `buildValveLeagueHistoryUrl(apiKey, leagueId, count)`.
- Produces: `normalizeValveLeagueMatches(payload) -> [{ match_id }]`.
- Produces internal action: `discoverValveLeagueMatches({ token, leagueId })`.

- [ ] **Step 1: Write failing URL, payload, isolation, and UI tests**

Expected URL shape:

```text
https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/v1/?key=REDACTED&league_id=19608&matches_requested=100
```

Assert normalization reads `payload.result.matches`, invalid IDs are discarded, and the runner still processes OpenDota/seed results if Valve discovery fails. Assert queue UI shows `斐济杯 · Valve` or the equivalent structured label.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/valveLeagueHistory.test.js tests/leagueSyncFunction.test.js tests/leagueSyncUi.test.js tests/leagueSyncView.test.js`

Expected: FAIL because Valve league discovery and league labels do not exist.

- [ ] **Step 3: Implement server-only Valve history discovery**

Use the existing `STEAM_WEB_API_KEY` from the `api` cloud function. The internal action must call `assertLeagueSyncToken`, allow only league 19608, fetch at most 100 recent matches, sanitize errors, and pass normalized rows to queue discovery with `discoverySource: 'valve'`.

- [ ] **Step 4: Call Valve discovery from the scheduled runner**

After OpenDota and seed discovery, call:

```js
await callApi('discoverValveLeagueMatches', { leagueId: '19608' });
```

Catch this source's error independently, then continue to `processLeagueQueue`.

- [ ] **Step 5: Add league/source labels to admin queue and history**

Decorate rows from structured metadata rather than parsing titles. Existing records with no league name fall back to league ID, then the current generic source text.

- [ ] **Step 6: Run focused tests and verify pass**

Run: `node --test tests/valveLeagueHistory.test.js tests/leagueSyncFunction.test.js tests/leagueSyncUi.test.js tests/leagueSyncView.test.js`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add cloudfunctions/api/valveLeagueHistory.js cloudfunctions/api/index.js cloudfunctions/leagueSync/runner.js utils/leagueSyncView.js pages/match/match.wxml tests/valveLeagueHistory.test.js tests/leagueSyncFunction.test.js tests/leagueSyncUi.test.js tests/leagueSyncView.test.js
git commit -m "feat: discover Fiji Cup matches through Valve"
```

### Task 9: Full Verification and Deployment Notes

**Files:**
- Modify if required: `tests/uploadPackage.test.js`
- Modify: `README.md`

**Interfaces:**
- Verifies all earlier tasks as one deployable release.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Verify package exclusions and source size**

Run: `node --test tests/uploadPackage.test.js`

Expected: PASS; `assets/`, cloud functions, docs, tests, and scripts are excluded from the uploaded mini program package as configured, and hero portrait binaries are absent.

- [ ] **Step 3: Check encoding and repository scope**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intentional feature files plus the pre-existing untracked `assets/` directory.

- [ ] **Step 4: Document exact deployment requirements**

Add to `README.md`:

```text
1. Deploy cloudfunctions/api with STEAM_WEB_API_KEY and LEAGUE_SYNC_TOKEN.
2. Deploy cloudfunctions/leagueSync with LEAGUE_SYNC_TOKEN and keep the existing trigger.
3. Add https://cdn.cloudflare.steamstatic.com to the mini program download-file legal domain.
4. Run one admin manual sync and verify match 8900989622 converges without duplicate points.
5. Open one legacy imported match and verify GPM/XPM refresh without leaderboard changes.
```

- [ ] **Step 5: Commit verification documentation**

```bash
git add README.md tests/uploadPackage.test.js
git commit -m "docs: add match detail sync deployment checks"
```

- [ ] **Step 6: Review final commit range**

Run: `git log --oneline --decorate -12`

Expected: one focused commit per task, no `assets/` commit, and no unrelated file changes.
