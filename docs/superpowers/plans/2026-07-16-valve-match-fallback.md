# Valve Match Import Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automatic Valve Web API fallback when OpenDota cannot return a submitted Dota 2 match.

**Architecture:** Add a pure CommonJS module under the existing cloud function that normalizes Valve responses and coordinates source fallback through injected request functions. Keep database reads, preview building, confirmation, scoring, history, and rollback in `cloudfunctions/api/index.js`, changing only how the upstream match payload is obtained.

**Tech Stack:** Native WeChat cloud function, Node.js CommonJS, built-in `https`, `wx-server-sdk`, Node test runner.

## Global Constraints

- Read the key only from `process.env.STEAM_WEB_API_KEY`.
- Never write the key to client code, database records, logs, errors, fixtures, or Git.
- Preserve the existing imported match record shape and scoring version 3.
- Preserve OpenDota parse requests, manual entry, duplicate protection, history details, deletion, and score rollback.
- Add no runtime dependency.

---

### Task 1: Normalize Valve Match Details

**Files:**
- Create: `cloudfunctions/api/matchSources.js`
- Create: `tests/matchSources.test.js`

**Interfaces:**
- Consumes: Valve response shaped as `{ result: { match_id, radiant_win, duration, players } }`.
- Produces: `normalizeValveMatch(payload, matchId)` returning the OpenDota-compatible fields consumed by `buildImportedMatchPreview`.

- [ ] **Step 1: Write the failing normalization tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeValveMatch } = require('../cloudfunctions/api/matchSources');

test('normalizeValveMatch unwraps result and orders players by side and slot', () => {
  const result = normalizeValveMatch({
    result: {
      match_id: 7001,
      radiant_win: false,
      duration: 1800,
      players: [
        { account_id: 6, player_slot: 128, hero_id: 16, kills: 6, deaths: 2, assists: 8 },
        { account_id: 1, player_slot: 0, hero_id: 11, kills: 1, deaths: 3, assists: 4 },
        { account_id: 2, player_slot: 1 }, { account_id: 3, player_slot: 2 },
        { account_id: 4, player_slot: 3 }, { account_id: 5, player_slot: 4 },
        { account_id: 7, player_slot: 129 }, { account_id: 8, player_slot: 130 },
        { account_id: 9, player_slot: 131 }, { account_id: 10, player_slot: 132 }
      ]
    }
  }, '7001');

  assert.equal(result.match_id, 7001);
  assert.equal(result.radiant_win, false);
  assert.deepEqual(result.players.map((player) => player.account_id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('normalizeValveMatch rejects incomplete payloads', () => {
  assert.throws(
    () => normalizeValveMatch({ result: { match_id: 7001, players: [] } }, '7001'),
    /Valve 比赛数据不完整/
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests\matchSources.test.js
```

Expected: FAIL because `cloudfunctions/api/matchSources.js` does not exist.

- [ ] **Step 3: Implement the minimal normalizer**

```js
function normalizeValveMatch(payload, expectedMatchId) {
  const match = payload && payload.result ? payload.result : payload;
  const players = match && Array.isArray(match.players) ? match.players.slice() : [];
  const matchId = String((match && match.match_id) || '');
  if (!match || matchId !== String(expectedMatchId) || players.length !== 10) {
    throw new Error('Valve 比赛数据不完整');
  }
  players.sort((left, right) => Number(left.player_slot || 0) - Number(right.player_slot || 0));
  const radiant = players.filter((player) => Number(player.player_slot || 0) < 128);
  const dire = players.filter((player) => Number(player.player_slot || 0) >= 128);
  if (radiant.length !== 5 || dire.length !== 5) {
    throw new Error('Valve 比赛数据不完整');
  }
  return {
    match_id: Number(match.match_id),
    radiant_win: Boolean(match.radiant_win),
    duration: Number(match.duration || 0),
    start_time: Number(match.start_time || 0),
    game_mode: Number(match.game_mode || 0),
    lobby_type: Number(match.lobby_type || 0),
    players: radiant.concat(dire).map((player) => ({
      account_id: Number(player.account_id || 0),
      player_slot: Number(player.player_slot || 0),
      hero_id: Number(player.hero_id || 0),
      kills: Number(player.kills || 0),
      deaths: Number(player.deaths || 0),
      assists: Number(player.assists || 0)
    }))
  };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command.

Expected: 2 tests pass.

- [ ] **Step 5: Commit the normalizer**

```powershell
git add cloudfunctions/api/matchSources.js tests/matchSources.test.js
git commit -m "feat: normalize Valve match details"
```

### Task 2: Coordinate OpenDota and Valve Fallback

**Files:**
- Modify: `cloudfunctions/api/matchSources.js`
- Modify: `tests/matchSources.test.js`

**Interfaces:**
- Consumes: `loadMatchWithFallback({ matchId, steamApiKey, fetchOpenDota, requestOpenDotaParse, fetchValve })`.
- Produces: `{ match, source, parseRequested }`, or a stable user-facing error with `code` set to `MATCH_PENDING`, `MATCH_NOT_FOUND`, or `VALVE_AUTH_FAILED`.

- [ ] **Step 1: Write failing source-selection tests**

Add tests that assert:

```js
test('loadMatchWithFallback does not call Valve when OpenDota succeeds', async () => {
  let valveCalls = 0;
  const result = await loadMatchWithFallback({
    matchId: '7001',
    steamApiKey: 'test-key',
    fetchOpenDota: async () => ({ match_id: 7001, players: Array(10).fill({}) }),
    requestOpenDotaParse: async () => false,
    fetchValve: async () => {
      valveCalls += 1;
      return {};
    }
  });
  assert.equal(result.source, 'opendota');
  assert.equal(valveCalls, 0);
});

test('loadMatchWithFallback uses Valve after OpenDota failure', async () => {
  const result = await loadMatchWithFallback({
    matchId: '7001',
    steamApiKey: 'test-key',
    fetchOpenDota: async () => {
      const error = new Error('missing');
      error.statusCode = 404;
      throw error;
    },
    requestOpenDotaParse: async () => true,
    fetchValve: async () => valveFixture
  });
  assert.equal(result.source, 'valve');
  assert.equal(result.parseRequested, true);
  assert.equal(result.match.match_id, 7001);
});

test('loadMatchWithFallback skips Valve when the server key is missing', async () => {
  await assert.rejects(
    loadMatchWithFallback({
      matchId: '7001',
      steamApiKey: '',
      fetchOpenDota: async () => {
        const error = new Error('missing');
        error.statusCode = 404;
        throw error;
      },
      requestOpenDotaParse: async () => true,
      fetchValve: async () => assert.fail('Valve should not be called')
    }),
    (error) => error.code === 'MATCH_PENDING'
  );
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run the Task 1 test command.

Expected: FAIL because `loadMatchWithFallback` is not exported.

- [ ] **Step 3: Implement source selection and stable errors**

Implement these rules:

```js
async function loadMatchWithFallback(options) {
  const {
    matchId,
    steamApiKey,
    fetchOpenDota,
    requestOpenDotaParse,
    fetchValve
  } = options;
  try {
    return { match: await fetchOpenDota(matchId), source: 'opendota', parseRequested: false };
  } catch (openDotaError) {
    const parseRequested = await requestOpenDotaParse(matchId);
    if (!steamApiKey) {
      throw createSourceError(
        parseRequested ? 'MATCH_PENDING' : 'MATCH_NOT_FOUND',
        parseRequested
          ? '比赛数据正在同步，请过几分钟再试，或由管理员手动录入'
          : '暂时无法获取这场比赛，请确认比赛 ID，或由管理员手动录入'
      );
    }
    try {
      const valvePayload = await fetchValve(matchId, steamApiKey);
      return {
        match: normalizeValveMatch(valvePayload, matchId),
        source: 'valve',
        parseRequested
      };
    } catch (valveError) {
      if (valveError && (valveError.statusCode === 401 || valveError.statusCode === 403)) {
        throw createSourceError('VALVE_AUTH_FAILED', 'Valve API 密钥配置无效，请联系管理员检查云函数环境变量');
      }
      throw createSourceError(
        parseRequested ? 'MATCH_PENDING' : 'MATCH_NOT_FOUND',
        parseRequested
          ? '比赛数据正在同步，请过几分钟再试，或由管理员手动录入'
          : 'OpenDota 和 Valve 都未找到这场比赛，请确认比赛 ID，或由管理员手动录入'
      );
    }
  }
}
```

The implementation must not attach upstream URLs, response bodies, or the key to returned errors.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 test command.

Expected: all source-selection and normalization tests pass.

- [ ] **Step 5: Commit fallback coordination**

```powershell
git add cloudfunctions/api/matchSources.js tests/matchSources.test.js
git commit -m "feat: add Valve match source fallback"
```

### Task 3: Connect the Fallback to the Cloud Function

**Files:**
- Modify: `cloudfunctions/api/index.js`
- Modify: `tests/matchSources.test.js`
- Modify: `tests/dataSafety.test.js`

**Interfaces:**
- Consumes: `loadMatchWithFallback` from Task 2 and `process.env.STEAM_WEB_API_KEY`.
- Produces: the same preview object currently returned by `previewImportedMatch`.

- [ ] **Step 1: Add failing integration-shape and secret-safety tests**

Add assertions that:

```js
const source = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'api', 'index.js'), 'utf8');
assert.match(source, /process\.env\.STEAM_WEB_API_KEY/);
assert.match(source, /loadMatchWithFallback/);
assert.doesNotMatch(source, /[A-F0-9]{32}/);
```

Add a test that `matchSources.js` builds the Valve endpoint through a callback owned by `index.js`, while errors never contain the supplied test key.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test tests\matchSources.test.js tests\dataSafety.test.js
```

Expected: FAIL because `index.js` does not use the fallback or environment variable.

- [ ] **Step 3: Wire the source loader into `previewImportedMatch`**

At the top of `cloudfunctions/api/index.js`, require:

```js
const { loadMatchWithFallback } = require('./matchSources');
```

Add a Valve fetch callback:

```js
async function fetchValveMatch(matchId, apiKey) {
  const url = 'https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/v1/'
    + `?key=${encodeURIComponent(apiKey)}&match_id=${encodeURIComponent(matchId)}`;
  return fetchJson(url);
}
```

Replace the OpenDota-only block in `previewImportedMatch` with:

```js
const sourceResult = await loadMatchWithFallback({
  matchId: normalizedMatchId,
  steamApiKey: String(process.env.STEAM_WEB_API_KEY || '').trim(),
  fetchOpenDota: (id) => fetchJson(`https://api.opendota.com/api/matches/${id}`),
  requestOpenDotaParse,
  fetchValve: fetchValveMatch
});
const apiMatch = sourceResult.match;
```

Do not change player lookup, matching validation, preview return value, confirmation, scoring, or database writes.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: focused tests pass and no key-shaped literal exists in tracked source.

- [ ] **Step 5: Commit cloud integration**

```powershell
git add cloudfunctions/api/index.js tests/matchSources.test.js tests/dataSafety.test.js
git commit -m "feat: use Valve fallback for match imports"
```

### Task 4: Full Verification and Deployment Check

**Files:**
- Verify only; modify a test or implementation file only if verification exposes a defect.

**Interfaces:**
- Consumes: the completed fallback implementation.
- Produces: a deployable `cloudfunctions/api` directory with no committed secret.

- [ ] **Step 1: Run the complete test suite**

```powershell
C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test
```

Expected: all tests pass.

- [ ] **Step 2: Check syntax and tracked secrets**

```powershell
C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check cloudfunctions\api\index.js
C:\Users\Tseng\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check cloudfunctions\api\matchSources.js
git grep -n -E "[A-F0-9]{32}"
git diff --check
```

Expected: syntax checks exit 0, secret scan has no API key matches, and diff check is clean.

- [ ] **Step 3: Review the final diff**

```powershell
git status --short
git diff HEAD~3 -- cloudfunctions/api/index.js cloudfunctions/api/matchSources.js tests
```

Expected: only fallback source selection, tests, and documentation changed; no scoring or database rollback logic changed.

- [ ] **Step 4: Record deployment instructions**

After implementation, deploy by right-clicking `cloudfunctions/api` in WeChat DevTools and selecting **上传并部署：云端安装依赖**. The already configured `STEAM_WEB_API_KEY` environment variable remains server-side.
