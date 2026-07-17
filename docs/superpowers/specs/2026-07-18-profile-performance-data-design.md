# Profile Performance Data Design

## Goal

Keep match, win, loss, and win-rate totals based on every stored match, while calculating personal performance only from matches that contain a complete individual-stat snapshot.

## Complete Performance Data

A player snapshot has complete performance data when it contains all five fields:

- `kills`
- `deaths`
- `assists`
- `goldPerMin`
- `xpPerMin`

Zero is a valid value. Completeness depends on field presence and finite numeric values, not on any value being greater than zero.

## Statistics

- `matches`, `wins`, `losses`, and win rate use all matches containing the player.
- KDA and average kills, deaths, assists, GPM, and XPM use only complete performance snapshots.
- When there are no complete performance snapshots, performance values display as zero.
- Recent matches continue to include every match.
- Hero summaries continue to use matches with a valid hero ID.
- No stored match, player, score, or database schema is changed.

## Implementation

Add a focused snapshot-completeness helper in `utils/playerMatchStats.js`. Derive a performance-only row list for aggregate totals and its divisor, while retaining the existing all-match row list for record totals and recent history.

## Verification

Add regression coverage proving that:

- A manual win/loss-only match affects match and result totals but not performance averages.
- A complete API snapshot with zero kills still contributes to performance averages.
- Existing full-stat aggregation remains unchanged.
