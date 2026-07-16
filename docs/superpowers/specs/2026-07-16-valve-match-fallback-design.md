# Valve Match Import Fallback Design

## Goal

Improve match import reliability without changing the existing confirmation,
scoring, history, or rollback behavior.

## Query Flow

1. Query OpenDota with the submitted match ID.
2. If OpenDota has no match, submit its parse request as today.
3. Query Valve's Dota 2 match details API as the automatic fallback.
4. If either source returns a valid match, convert it to the existing preview
   shape and let the administrator confirm the import.
5. If neither source has the match, show a short message that the administrator
   can retry later or enter the result manually.

## Security

- Read the Steam Web API key only from `process.env.STEAM_WEB_API_KEY`.
- Never include the key in client code, database records, errors, or logs.
- Do not add a local secret file or commit a key to Git.
- If the environment variable is missing, skip Valve cleanly and preserve the
  OpenDota/manual-entry behavior.

## Data Compatibility

The fallback must produce the same fields already consumed by
`buildMatchPreview`: match ID, winner, duration, start time, game mode, lobby
type, and ten player records with account ID, player slot, hero ID, kills,
deaths, and assists.

Imported records keep the current `imported-<matchId>` identifier, scoring
version, participant matching, details page, duplicate protection, deletion,
and score rollback behavior.

## Error Handling

- OpenDota 404 or parse delay triggers Valve fallback.
- OpenDota network and 5xx failures also trigger Valve fallback.
- Valve authentication failure reports that the server key configuration is
  invalid without exposing the key.
- Valve missing-match responses retain the retry/manual-entry message.
- A malformed upstream payload is rejected before any database write.

## Tests

- Falls back to Valve after OpenDota does not return a match.
- Does not call Valve when OpenDota succeeds.
- Maps a Valve match payload into the existing preview format.
- Handles a missing environment variable without crashing.
- Rejects malformed or incomplete Valve payloads.
- Confirms that source failures cannot write a match or change player points.
- Runs the complete existing test suite after the focused tests pass.
