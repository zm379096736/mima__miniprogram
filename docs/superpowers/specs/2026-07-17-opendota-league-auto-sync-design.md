# OpenDota League Auto Sync Design

## Goal

Automatically import matches from OpenDota league `20040` every 15 minutes, settle points only when all ten participants can be matched safely, and expose richer inhouse-only statistics on the My page.

## Scope

- Add a dedicated scheduled cloud function for league synchronization.
- Reuse the existing OpenDota match normalization, Steam ID matching, scoring, history, detail, and rollback behavior.
- Add an administrator review queue for matches that cannot be settled safely.
- Add administrator controls for immediate sync, retry, pause, and review.
- Add personal match statistics and recent match details to the My page.
- Keep manual match ID import and manual result entry available.

The feature does not import a player's unrelated public matches and does not automatically create temporary player cards.

## Architecture

### Dedicated `leagueSync` cloud function

Create a separate cloud function so scheduled work does not share the execution budget or authorization path of the existing client API function. A CloudBase timer trigger runs it every 15 minutes. The same function accepts an immediate-sync invocation from the mini program only after validating the caller's OpenID against the administrator list.

The schedule uses a seven-field CloudBase cron expression and is deployed through the function's `config.json` trigger configuration.

### Shared match import services

Move or expose the reusable parts of the existing single-match import path behind focused modules:

- OpenDota league match listing
- Full match loading and normalization
- Steam ID to player-card matching
- Imported record construction
- Scoring and player-stat updates
- Idempotent settlement

Manual import and automatic sync must call the same settlement service so their scoring and rollback fields cannot drift.

### Collections

Use the existing `matches` and `players` collections, plus these records:

- `system/leagueSync`: league ID, enabled flag, last run time, last successful run time, last error, and recent counters.
- `leagueSyncQueue/{matchId}`: match ID, status, reason, attempts, source timestamps, unmatched Steam IDs, normalized preview, and settlement result.

Queue statuses are `discovered`, `waiting_data`, `needs_review`, `processing`, `imported`, and `failed`.

## Synchronization Flow

1. Exit successfully when synchronization is paused.
2. Acquire a short-lived job lock to prevent overlapping timer runs.
3. Fetch the match list for OpenDota league `20040`.
4. Upsert newly discovered match IDs into the queue.
5. Process a bounded batch, newest unprocessed matches first.
6. Fetch complete match details through the existing OpenDota and Valve fallback path.
7. Match all ten account IDs against every Steam ID bound to player cards.
8. Automatically settle only when there are exactly ten unique player-card matches, split into five Radiant and five Dire players.
9. Put incomplete, unknown, or ambiguous lineups into `needs_review` without changing any player data.
10. Record run counters and release the job lock.

The bounded batch keeps each invocation within the cloud function timeout. Remaining queue items are handled by later runs.

## Settlement and Idempotency

Each imported match uses `imported-{matchId}` as its unique match document ID. Settlement first creates or claims an idempotency record. If the match already exists or another invocation owns the claim, the operation exits without updating players.

Automatic settlement applies the current scoring rule:

- Winner: 2 points
- Loser: -1 point

The stored match includes:

- `participantIds`
- `winnerIds`
- actual Radiant and Dire snapshots
- `plannedParticipantIds` when available
- `scoringVersion`
- `source: league-auto`
- `leagueId`
- `syncedAt`
- normalized match statistics needed by detail and personal-stat views

Deleting an imported match uses these stored rollback fields to reverse points, matches, wins, and losses exactly once.

## Administrator Review

The match history page shows:

- Sync enabled or paused state
- Last successful sync time
- Last error, when present
- Immediate Sync button
- Pause or Resume control
- Pending review count and list
- Retry action for waiting or failed matches

For `needs_review`, the administrator uses the existing actual-lineup selectors. Unknown participants may be linked to an existing card or handled through the existing temporary-card flow. Confirmation calls the shared settlement service and preserves the imported match ID.

Non-administrators can see sync status but cannot run, pause, retry, reconcile, or settle synchronization jobs.

## My Page

The My page calculates statistics only from matches stored by this mini program:

- Current points and points rank
- Matches, wins, losses, and win rate
- Total kills, deaths, and assists
- Overall KDA
- Average kills, deaths, and assists
- Average GPM and XPM
- Hero usage and win/loss distribution over the latest 20 matches
- All bound Steam IDs
- Recent personal matches with result, hero, KDA, duration, and date

Selecting a recent match opens the existing match-detail view, extended to show both lineups, heroes, KDA, GPM, XPM, duration, winner, source, and import time when available.

## Match History

History remains grouped by date and labels each record as automatic import, manual import, or manual entry. Imported records open full API detail; manually entered records continue to show their recorded participant lineup.

## Failure Handling

- Missing or not-yet-parsed OpenDota data becomes `waiting_data` and is retried later.
- Network failures update the queue attempt count and error without changing match or player data.
- Invalid API authentication remains visible to administrators and does not erase prior history.
- Ambiguous Steam ID ownership becomes `needs_review` rather than guessing.
- A match with fewer or more than ten usable participants never settles automatically.
- Repeated failures use increasing retry intervals so one bad match does not consume every run.
- Queue and sync-state writes are diagnostic; scoring starts only after validation and an idempotency claim.

## Testing

Automated tests cover:

- League list normalization and discovery
- Multi-Steam-ID participant matching
- Complete ten-player automatic settlement
- Unknown and ambiguous players entering review
- Duplicate timer invocations and duplicate match IDs
- OpenDota pending data and retry behavior
- Batch limits and lock expiry
- Winner 2 / loser -1 scoring
- Personal aggregate calculations and recent hero statistics
- Match detail fields
- Imported match deletion and full stat rollback
- Administrator-only controls

Manual verification in WeChat Developer Tools covers trigger upload, immediate sync, cloud database visibility, phone-to-phone consistency, My page rendering, review flow, and deletion rollback.

## Deployment

1. Upload and deploy the updated API cloud function with dependencies.
2. Upload and deploy the new `leagueSync` cloud function with dependencies.
3. Upload its timer trigger from `config.json`.
4. Confirm league ID `20040` and enabled state in cloud configuration.
5. Run Immediate Sync as an administrator and inspect function logs and queue records.
6. Upload a mini-program development build and verify on a real phone before submitting a release.

The feature assumes OpenDota exposes league `20040` and its match list. If the league is not indexed, the scheduler remains healthy but discovers no matches; manual import and manual result entry remain available.
