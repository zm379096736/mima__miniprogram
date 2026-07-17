# Deployment

## Steam Identity Binding Update

After deploying this version:

1. Upload and deploy `cloudfunctions/api` with cloud dependencies installed.
2. Compile and upload the mini program so match confirmation and administrator merge prompts use the new API contract.
3. `cloudfunctions/leagueSync` does not need redeployment because it calls the shared `api` cloud function.
4. No collection or index must be created manually; identity merges use the existing `players`, `matches`, and `rooms` collections.

The administrator can manage another player's Steam IDs from the administrator panel on the room page. Imported match confirmation automatically appends unowned Dota account IDs. A temporary owner requires an explicit merge confirmation, while a permanent owner conflict blocks the operation.
