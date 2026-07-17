# Profile Performance Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude win/loss-only matches from profile KDA and average performance calculations while retaining them in record totals.

**Architecture:** Keep the existing all-match `relevant` rows for matches, wins, losses, recent history, and hero summaries. Derive a second `performanceRows` list using a focused snapshot completeness predicate and use only that list for KDA, totals, and average performance values.

**Tech Stack:** WeChat native mini program, CommonJS JavaScript, Node.js built-in test runner.

## Global Constraints

- A complete performance snapshot contains `kills`, `deaths`, `assists`, `goldPerMin`, and `xpPerMin`.
- Zero is a valid performance value.
- Match, win, loss, win-rate, recent-match, hero, score, and database behavior must remain unchanged.
- No database migration or schema change.

---

### Task 1: Separate Record Totals From Performance Averages

**Files:**
- Modify: `utils/playerMatchStats.js`
- Test: `tests/playerMatchStats.test.js`

**Interfaces:**
- Consumes: player snapshots produced by stored match `radiant` and `dire` arrays.
- Produces: unchanged `buildPlayerMatchStats(player, players, matches)` result shape with corrected performance aggregates.

- [ ] **Step 1: Write the failing regression test**

Add a test containing one manual result-only match and one complete API match whose player has zero kills:

```js
test('performance averages use only complete personal stat snapshots', () => {
  const stats = buildPlayerMatchStats(
    { id: 'p1', points: 1 },
    [{ id: 'p1', points: 1 }],
    [
      {
        id: 'manual-1', participantIds: ['p1'], winnerIds: [],
        radiant: [{ playerId: 'p1', score: 80 }], dire: []
      },
      {
        id: 'imported-1', participantIds: ['p1'], winnerIds: ['p1'],
        radiant: [{
          playerId: 'p1', heroId: 1, kills: 0, deaths: 2, assists: 8,
          goldPerMin: 400, xpPerMin: 500
        }],
        dire: []
      }
    ]
  );

  assert.equal(stats.matches, 2);
  assert.equal(stats.wins, 1);
  assert.equal(stats.losses, 1);
  assert.equal(stats.kdaText, '4.00');
  assert.equal(stats.averageKills, '0.0');
  assert.equal(stats.averageDeaths, '2.0');
  assert.equal(stats.averageAssists, '8.0');
  assert.equal(stats.averageGpm, '400');
  assert.equal(stats.averageXpm, '500');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/playerMatchStats.test.js
```

Expected: FAIL because the manual match currently increases the performance divisor from one to two.

- [ ] **Step 3: Implement complete-snapshot filtering**

Add a private predicate in `utils/playerMatchStats.js`:

```js
const PERFORMANCE_FIELDS = ['kills', 'deaths', 'assists', 'goldPerMin', 'xpPerMin'];

function hasCompletePerformanceData(snapshot) {
  return PERFORMANCE_FIELDS.every((field) => {
    if (!Object.prototype.hasOwnProperty.call(snapshot || {}, field)) return false;
    const value = snapshot[field];
    return value !== null && value !== '' && Number.isFinite(Number(value));
  });
}
```

Inside `buildPlayerMatchStats`, derive `performanceRows` from `relevant`, calculate `totals` from `performanceRows`, and set the performance divisor to `Math.max(1, performanceRows.length)`. Keep record totals, recent rows, and hero summaries based on `relevant`.

- [ ] **Step 4: Run focused and complete verification**

Run:

```powershell
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests/playerMatchStats.test.js
& 'C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test
```

Expected: focused tests pass, then the complete suite passes with zero failures.

- [ ] **Step 5: Commit only the feature files**

```powershell
git add -- utils/playerMatchStats.js tests/playerMatchStats.test.js
git commit -m "fix: exclude result-only matches from performance averages"
```
