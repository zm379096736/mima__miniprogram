# League Discovery Date Filter Design

## Goal

Automatically converge the existing backlog of old league queue rows without changing the four historical matches that have already been imported.

## Root Cause

League discovery currently reduces OpenDota and Valve match summaries to match IDs. Although those summaries can include `start_time`, the value is discarded. The settlement-time date gate therefore cannot classify a queued match when detail APIs return no data, leaving old rows in `waiting_data` indefinitely.

## Discovery Records

Normalize each league summary into:

- `matchId`: validated decimal match ID.
- `startTime`: finite positive Unix seconds when supplied as `start_time` or `startTime`; otherwise `0`.

Keep `normalizeLeagueMatchIds` compatible by deriving its existing ID list from the normalized records.

## Discovery Reconciliation

During `discoverLeagueMatches`, handle each normalized summary transactionally:

- If an authoritative `matches/imported-{matchId}` record exists, converge its queue row to `imported` without changing player data.
- If the queue row is already `imported`, preserve it.
- If `0 < startTime < 1784304000`, create or update the queue row as terminal `ignored_before_start`, clear retry and processing fields, and do not request match details.
- If `startTime >= 1784304000`, use the existing create-if-absent discovery behavior.
- If `startTime` is missing, preserve the existing behavior and allow the settlement-time gate to keep it retryable.

An ignored row rediscovered without a timestamp remains ignored. Existing review and imported rows must not be regressed by concurrent discovery writes.

## Valve Data

Preserve `start_time` when normalizing Valve `GetMatchHistory` summaries. OpenDota summaries are already passed directly to discovery and require no transport change.

## Existing Data

- Do not delete or update the four existing `matches` documents.
- Do not modify player points, matches, wins, KDA, GPM, XPM, or hero statistics.
- The existing settlement-time gate remains in place as defense in depth.

## Expected Result

After deployment and the next successful synchronization, rediscovered pre-start rows become `ignored_before_start` and stop contributing to the pending count. Eligible post-start rows continue through the normal detail and settlement flow.

## Verification

Add regression coverage proving that:

- Valve normalization retains valid start times.
- Discovery creates old summaries directly as ignored rows.
- Discovery converts an old active row to ignored.
- Discovery does not regress imported or review rows.
- An authoritative stored match converges to imported instead of ignored.
- Missing-time and post-start summaries retain existing behavior.
