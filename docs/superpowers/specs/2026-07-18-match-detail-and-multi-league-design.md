# Match Detail and Multi-League Sync Design

Date: 2026-07-18

## Goal

Improve manual and imported match records without changing the existing win/loss scoring rules:

- Manual matches show each team's self-rating total and every participant's avatar and self-rating.
- Imported matches show hero portraits, Chinese hero names, KDA, GPM, and XPM.
- Old imported records with missing detailed stats repair themselves once when opened, without applying scoring again.
- Automatic league sync covers Mima Inhouse league 20040 and Fiji Cup league 19608.
- The profile page shows Chinese hero names and portraits instead of raw hero IDs.

Points remain independent from self-rating. A win adds 2 points and a loss subtracts 1 point. Team totals in manual matches are sums of player self-ratings, not kill scores.

## Existing Constraints

- A match ID is the idempotency key for imported records.
- Imported matches may require an administrator to reconcile the ten API slots with actual participants.
- Existing historical records may lack avatars, self-rating totals, GPM, or XPM.
- The main package has already approached WeChat's 2 MB source limit, so hero portraits must not be bundled in the package.
- OpenDota currently returns match 8900989622 with league ID 19608 and populated player statistics, while its league 19608 match-list endpoint may be empty.

## Data Model

### Player snapshot

Each stored participant snapshot gains stable display fields:

```js
{
  playerId,
  name,
  score,
  avatarUrl,
  temporary,
  assignedPosition
}
```

`score` is the player's self-rating at match submission time. `avatarUrl` stores the durable cloud file ID or durable configured URL, not a temporary download URL. New records therefore keep their historical appearance even if a player later edits their card.

Imported snapshots retain the existing API fields and add the display snapshot fields:

```js
{
  accountId,
  playerSlot,
  playerId,
  name,
  score,
  avatarUrl,
  heroId,
  kills,
  deaths,
  assists,
  goldPerMin,
  xpPerMin
}
```

### Match totals

Manual match records store:

```js
{
  radiantScore,
  direScore,
  scoreGap
}
```

The first two values are the sums of the five frozen self-ratings. `scoreGap` remains available for old list views.

Imported matches keep kill totals separately from self-rating totals. The UI must label them explicitly so users do not confuse kills, self-rating, and leaderboard points.

### League metadata

League discovery and queue rows carry:

```js
{
  leagueId,
  leagueName,
  discoverySource
}
```

The stored match copies these values at settlement. Match IDs remain globally unique, so discovery from two sources cannot award points twice.

## Manual Match Flow

1. The administrator selects the actual five Radiant and five Dire participants.
2. Selection rows show each player's current avatar, name, position, and self-rating.
3. The server validates ten distinct existing players.
4. The server calculates `radiantScore` and `direScore` from current player documents.
5. The server freezes the participant display snapshots and writes the match.
6. The history list shows both team totals; the detail page shows the complete two-team lineup.

Old manual records are read compatibly:

- Missing team totals are calculated from stored participant scores.
- Missing snapshot avatars fall back to the player's current avatar.
- Missing snapshot scores fall back to current self-ratings only for display; the record is not silently rewritten.

## Imported Match Detail Flow

New imports preserve API statistics through preview, lineup reconciliation, queue storage, settlement, and detail rendering. The detail page displays:

- hero portrait and Chinese hero name;
- player avatar and player name;
- KDA;
- GPM and XPM;
- frozen self-rating for a bound Mima player;
- winner, duration, league, and source.

Manual matches do not fabricate KDA, GPM, XPM, or kill totals.

### Historical detail repair

The current detail formatter turns missing GPM/XPM into zero. For an imported match whose participant details are incomplete, the detail page calls a dedicated cloud action once:

1. Verify that the caller can read the match and that it is an imported record.
2. Fetch the match through the existing OpenDota-to-Valve fallback.
3. Merge API statistics by side and player slot/account ID.
4. Preserve the stored participant binding, display snapshot, winner, participant IDs, winner IDs, scoring version, and timestamps.
5. Update only detail fields such as hero, KDA, GPM, XPM, duration, and source metadata.
6. Return the refreshed record to the page.

This repair path must never call settlement, update player points, increment matches or wins, or create another match. A repair marker prevents repeated network calls after a successful refresh. If both upstream sources fail, the existing record remains readable and the UI shows unavailable values as `--`, not `0`.

## Hero Metadata and Images

A small client-side hero metadata module maps hero ID to Chinese name and image slug. It is used by profile summaries, recent matches, imported previews, and match details.

Hero portraits use a remote Dota image host rather than package assets. The image domain must be added to the mini program download-domain allowlist. Every image has a local placeholder and an error fallback. Unknown future hero IDs render as `Unknown Hero #ID` in the internal model and `未知英雄 #ID` in the UI.

Only metadata text is bundled, keeping package growth small.

## Multi-League Automatic Sync

The single hard-coded league ID becomes a configured list:

```js
[
  { id: '20040', name: '秘马内战' },
  { id: '19608', name: '斐济杯' }
]
```

Discovery uses these sources:

1. OpenDota league match lists for both leagues.
2. Valve league match history for league 19608 when OpenDota's list is empty or stale.
3. A small seed list containing match 8900989622 for first-run verification.
4. The existing administrator match-ID import as the final fallback.

All discovered IDs enter the existing queue with league metadata. Queue processing continues to use the current detail fallback, lineup classification, review flow, idempotent settlement, retry schedule, and lock.

The seed is discovery-only. If the match already exists or has already been settled, convergence marks the queue row imported without changing player statistics.

## User Interface

### History list

- Manual match: winner plus `天辉自评 X / 夜魇自评 Y`.
- Imported match: winner, kill score when available, league name, and source.
- Every history row remains tappable to open detail.

### Match detail

- Two visually distinct team sections.
- Hero portrait is the primary game-data image for imported rows.
- Player avatar, name, self-rating, KDA, GPM, and XPM are aligned in a compact row.
- Manual rows show avatar, name, position, and self-rating only.
- Missing imported metrics display `--` while repair is pending or unavailable.

### Profile

- Recent hero summary shows portrait, Chinese name, matches, wins, and win rate.
- Recent match rows show portrait and Chinese hero name instead of `英雄 39` style labels.

### Admin sync panel

- Queue rows identify `秘马内战` or `斐济杯`.
- Review and retry behavior remains administrator-only.

## Error Handling and Security

- Steam API keys remain server-side environment variables.
- Upstream errors are sanitized before returning to the client.
- Detail repair is idempotent and cannot mutate scoring fields.
- League discovery validates IDs and limits batch size and API work per invocation.
- A failure in one league does not block discovery for the other league.
- Missing hero images degrade to a placeholder without blocking the page.

## Testing

Add focused tests for:

- manual lineup snapshots include avatar and self-rating;
- manual team totals are persisted and rendered;
- imported settlement preserves hero, KDA, GPM, and XPM;
- lineup reconciliation preserves API statistics while replacing participant bindings;
- historical detail repair updates only allowed detail fields;
- detail repair never changes points, wins, matches, or winner IDs;
- missing metrics render as `--` instead of zero;
- hero IDs map to Chinese names and portrait URLs, with unknown-ID fallback;
- both league IDs are discovered and tagged correctly;
- Fiji Cup seed match is idempotent;
- duplicate discovery across OpenDota, Valve, and seeds settles once;
- a failure in one discovery source does not stop the other source.

Run the complete Node test suite and a WeChat source-size check before release.

## Rollout

1. Deploy the updated `api` cloud function.
2. Configure the hero portrait download domain in the WeChat mini program console.
3. Deploy the updated `leagueSync` cloud function and retain its trigger and environment variables.
4. Upload and test the mini program development version.
5. Run one manual sync and verify match 8900989622 is discovered or converges without duplicate scoring.
6. Open one old imported match and verify its details refresh without changing leaderboard points.

