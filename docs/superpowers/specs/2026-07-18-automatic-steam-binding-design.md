# Automatic Steam Binding And Temporary Player Merge Design

## Goal

When an administrator associates a Dota match participant with a player card, automatically bind that participant's Dota account ID to the selected player. Provide administrators with the same ownership and merge workflow when editing another player's Steam IDs.

## Scope

The feature applies to:

- Manual match ID import confirmation.
- League synchronization review confirmation.
- Administrator editing of another player's Steam IDs.

Ordinary members keep the existing ability to edit only their own Steam IDs. Manual result entry without imported participant account IDs is unchanged.

## Canonical Identifier

Imported match data provides a Dota `account_id`. Store its decimal string in the existing `steamIds` array and regenerate the legacy `steamId` display field from that array. Existing account ID and Steam64 normalization remains supported, so either representation entered by a user resolves to the same Dota account.

All writes normalize numeric values, remove duplicates, and preserve a player's existing IDs.

## Binding Rules

For every imported participant row associated with a selected player:

1. If the account ID has no owner, append it to the selected player's Steam IDs.
2. If the selected player already owns it, make no binding change.
3. If another permanent player owns it, block the entire operation and identify the conflicting ID and player name.
4. If an unclaimed temporary player owns it, return a merge requirement without writing match, score, binding, or player data.

The server performs these checks for all ten participant rows before any settlement. A conflict in one row prevents partial binding or partial match import.

## Confirmation Flow

The first confirmation request acts as a server-side preflight when temporary ownership is found. It returns structured merge information containing:

- Temporary player ID and name.
- Target permanent player ID and name.
- Matching account IDs.

The mini program displays a confirmation modal such as `临时选手 A 将合并到正式选手 B，是否继续？`. If the administrator confirms, the client resubmits with explicit temporary-player merge approvals.

The server reloads all affected players and revalidates ownership before writing. Client approval never bypasses the final conflict check.

## Temporary Player Merge

The temporary card is merged into the selected permanent card with these rules:

- Preserve the permanent card's `openid`, name, avatar, self-rating, preferred positions, and profile completion state.
- Union and normalize both cards' Steam IDs.
- Add the temporary card's points, matches, wins, MVP count, touch count, pigeon count, and pressure count to the permanent card.
- Replace the temporary player ID with the permanent player ID in historical match participant rows, participant ID lists, winner ID lists, and stored team snapshots.
- Replace the temporary player ID in current room signups, waitlist, rotation state, and generated teams.
- Replace any remaining honor or vote references even though voting is currently hidden, so old stored state remains consistent.
- Delete the temporary player document only after every required migration write succeeds.

If the temporary and permanent player appear in the same historical match or in conflicting current-room slots, block the merge and identify the record requiring manual review. Do not silently deduplicate a match because that would alter participation and scoring history.

The merge operation must be idempotent. Repeating an approved request after a client timeout must either observe the completed merge or safely finish the same migration without adding statistics twice.

## Match Settlement

After all requested merges complete and ownership is revalidated, bind previously unowned account IDs and settle the imported match using the existing centralized settlement path.

Binding and settlement must not permit a match to score without its intended Steam ID updates. Existing duplicate-match convergence remains authoritative: retrying an already imported match cannot add bindings, merge statistics, or score players a second time unless an administrator uses the separate Steam ID management action.

## Administrator Steam ID Management

Add a compact section to the existing administrator panel:

- Select a player card.
- Edit that player's Steam IDs as a normalized multi-value field.
- Save through a protected cloud action.

The action uses the same ownership rules as match association. A permanent-player conflict is blocked. Temporary ownership returns the same merge confirmation flow. Removing an ID is allowed only from the selected player and does not alter historical matches.

## Authorization And Errors

Only configured administrators may:

- Bind IDs through imported match confirmation.
- Approve a temporary-player merge.
- Edit another player's Steam IDs.

Business errors must be concise and contain no stack, token, key, or upstream URL. Permanent conflicts use a message such as `Steam ID 12345 已绑定正式选手“小柿”，请先解除后再操作`.

No client-provided player name, ownership state, statistics, or temporary flag is trusted. The server loads current documents by ID and derives every migration update.

## Verification

Regression coverage will prove:

- An unowned account ID is appended during imported-match confirmation.
- Existing IDs are preserved and duplicate aliases do not create duplicate entries.
- A permanent owner conflict causes zero match, score, binding, or merge writes.
- Temporary ownership returns a no-write merge preflight.
- Approved merging preserves the permanent profile, combines counters once, migrates historical matches and room references, and removes the temporary card.
- A temporary/permanent pair found in the same match is rejected.
- Retrying an approved merge is idempotent.
- Manual match import and league review use the same binding behavior.
- Administrator Steam ID edits enforce authorization and the same conflicts.
- Ordinary members cannot edit another player's IDs or approve merges.

## Unchanged Behavior

- Manual win/loss-only entries do not create Steam bindings because they contain no Dota account IDs.
- Match scoring remains win `+2` and loss `-1`.
- Self-rating remains separate from match points.
- Existing Steam64 and account ID matching remains supported.
- Voting stays disabled.
