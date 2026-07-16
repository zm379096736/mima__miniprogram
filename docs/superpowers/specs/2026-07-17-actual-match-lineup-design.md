# Actual Match Lineup Reconciliation Design

## Goal

Separate room signup and planned teams from match settlement so points, wins,
match counts, details, and rollback always use the ten players who actually
played.

## Core Rules

- Signup, waitlist, rotation, and auto-balance remain planning tools.
- Every settled match has exactly five Radiant and five Dire players.
- The ten actual players may come from any player card, even if they did not
  sign up.
- A player who signed up but did not play receives no match result.
- Pigeon marking stays an independent administrator decision.
- Actual lineups are stored on the match and are the only source used for
  scoring and rollback.

## Manual Match Flow

The match page shows an administrator-only actual-lineup editor with five
Radiant slots and five Dire slots. It starts from the current balanced teams,
but every slot can select any existing player card.

The cloud function receives the two ordered player ID arrays, validates ten
unique existing cards, builds immutable player snapshots, applies the selected
winner, and stores the same rollback fields used today.

## Imported Match Flow

An API preview still displays side, hero, and KDA data. Steam account IDs are
matched against every player card, not against room signup.

Each API player row also has an administrator picker. The initial value is the
automatic match; the administrator can correct it. Confirmation sends two
ordered five-player ID arrays aligned with the API player rows. All ten rows
must resolve to ten unique player cards before settlement.

The cloud function fetches the match again, applies the administrator's ordered
assignments, validates them, and stores KDA plus the resolved player snapshots.
No score or database write occurs before validation succeeds.

## Temporary Player Cards

An administrator may create a temporary player card with:

- display name;
- optional Dota account ID;
- self-rating default `80`;
- match points and statistics starting at `0`;
- all five preferred positions;
- `temporary: true` and no WeChat OpenID.

Imported unmatched rows can create a temporary card pre-bound to that row's
Dota account ID. Manual settlement can create an unbound temporary card.

When a real user later saves a completed profile with the same Dota account ID,
the cloud function claims the unused temporary card by attaching that
user's OpenID and profile data while preserving the temporary card's stable
player ID and accumulated history. The empty auto-created placeholder card is
removed. Duplicate ownership of a Dota account ID is rejected.

## Data Shape

New match records keep existing fields and add:

- `lineupSource`: `manual-reconciled` or `import-reconciled`;
- `plannedParticipantIds`: snapshot of the room teams when available;
- `participantIds`: actual ten player IDs;
- `winnerIds`: actual five winner IDs;
- `radiant` and `dire`: actual ordered player snapshots.

Temporary cards use the existing `players` collection, so rankings, details,
competition reset, and rollback continue to use one player model.

## Permissions

- Only administrators can create temporary cards.
- Only administrators can settle or correct an actual lineup.
- Player-card claiming occurs only while the logged-in user saves a profile
  containing the same Dota account ID.
- Existing administrator checks for result recording and deletion remain.

## Error Handling

- Reject fewer or more than five players per side.
- Reject duplicate player IDs across either side.
- Reject missing or deleted player cards.
- Reject imported confirmation while any API row is unresolved.
- Reject a Dota account ID already owned by a non-temporary card.
- A failed validation must not update points, wins, matches, or history.

## Compatibility

- Existing match records remain readable and deletable.
- Existing scoring version `3` remains unchanged.
- Existing deletion rollback continues to use `participantIds` and
  `winnerIds`.
- Room signup, waitlist, team balancing, rotation, and pigeon logic are not
  changed.
- Local preview mode keeps a functional manual reconciliation path.

## Tests

- Manual settlement scores the submitted actual lineup instead of room teams.
- Non-signup players can appear in an actual lineup.
- Invalid or duplicate lineups are rejected before scoring.
- Imported assignments override an incorrect automatic Steam match.
- Imported settlement requires ten resolved unique cards.
- Temporary cards start with zero competition statistics.
- A matching Steam ID can claim a temporary card without changing its player
  ID or accumulated statistics.
- Historical deletion reverses the actual lineup after reconciliation.
- Existing match, room, player, and scoring tests remain green.
