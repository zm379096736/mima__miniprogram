# League Review-Only UI Design

## Goal

Show administrators only league matches that require lineup confirmation, while keeping every other synchronization status available to backend processing.

## Server Response

`getClientLeagueSyncState` will expose the existing `pendingCount` field with review-only semantics:

- Count only queue rows whose status is `needs_review`.
- For administrators, return only `needs_review` rows in `queuePreview`.
- Fetch a bounded review set without requiring a compound database index, sort it by `updatedAt` in application code, and return at most 20 rows.

The server must not delete, reset, retry, or otherwise update queue rows while building this view.

## Client View

- Change the badge text from `待处理 X 场` to `待确认 X 场`.
- Render only the server-provided review rows.
- When there are no review rows, show `暂无需要确认的比赛`.
- Keep the existing administrator retry and confirmation behavior for review rows.

## Unchanged Behavior

- `waiting_data`, `ignored_before_start`, `failed`, `processing`, `discovered`, and `imported` rows remain stored in the database.
- Automatic synchronization, retries, settlement, points, and historical matches are unchanged.
- Internal synchronization state counters remain unchanged; only the client-facing count and queue are narrowed.

## Verification

Add regression coverage proving that:

- Client bootstrap counts only `needs_review` rows.
- Administrator queue preview contains only `needs_review` rows and is limited to 20.
- The badge says `待确认 X 场`.
- Empty review queues show `暂无需要确认的比赛`.
