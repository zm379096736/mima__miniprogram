# League Sync Start Date Design

## Goal

Preserve the four existing historical match records and their player statistics, while preventing automatic league synchronization from settling any newly discovered match played before the fixed start date.

## Start Date

- Local boundary: `2026-07-18 00:00:00` in Asia/Shanghai (`UTC+08:00`).
- Unix timestamp boundary: `1784304000` seconds.
- The boundary is fixed and does not move forward each day.
- Matches at or after the boundary are eligible.

## Settlement Gate

Apply the date rule after a match preview has been loaded and before lineup classification or settlement. This makes the rule independent of whether the match was discovered through OpenDota, Valve, or a deterministic seed.

- `startTime >= 1784304000`: continue through the existing review and settlement flow.
- `0 < startTime < 1784304000`: update the queue row to terminal status `ignored_before_start`; do not create a match or modify a player.
- Missing or invalid `startTime`: do not settle; keep the row retryable as `waiting_data` so a later source response can supply the time.

The new terminal status must not contribute to the pending queue count or be selected for processing again.

## Existing Data

- Do not scan, delete, update, or resettle existing `matches` documents.
- Do not change current player points, matches, wins, KDA, GPM, XPM, or hero statistics.
- Existing imported queue rows remain authoritative and are not reprocessed.

## Administrator View

Display `ignored_before_start` as `起算日前，已忽略` in the administrator synchronization queue. The row is informational and exposes no retry or lineup-confirmation action.

## Verification

Add regression coverage proving that:

- A preview before the boundary becomes terminal without settlement.
- A preview exactly at the boundary is processed normally.
- A preview with no valid start time remains retryable and is not settled.
- Pending counts exclude ignored rows.
- The administrator view uses the Chinese ignored-status label.
