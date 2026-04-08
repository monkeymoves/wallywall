# Firestore Data Model

## `boards`
Path: `/boards/{boardId}`

```json
{
  "ownerUid": "uid",
  "name": "The Church",
  "imageUrl": "https://...",
  "timestamp": "Timestamp"
}
```

Notes:
- Board documents are the canonical wall records.
- Owners are the only users allowed to update or delete the board document itself.

## `boards/{boardId}/problems`
Path: `/boards/{boardId}/problems/{problemId}`

```json
{
  "name": "warmup right",
  "description": "Optional notes, beta, setters, or feet rules",
  "grade": "V2",
  "holds": [
    { "xRatio": 0.61, "yRatio": 0.67, "type": "start" },
    { "xRatio": 0.66, "yRatio": 0.58, "type": "hold" },
    { "xRatio": 0.78, "yRatio": 0.16, "type": "finish" }
  ],
  "ownerUid": "uid",
  "guestCode": "AB12CD34",
  "createdAt": "Timestamp"
}
```

Notes:
- `ownerUid` is present for signed-in creates.
- `guestCode` is only included for guest edit writes and is used by Firestore rules to authorize create/update.
- Hold coordinates are stored as ratios so markers stay aligned across image sizes.

## `boards/{boardId}/permissions`
Path: `/boards/{boardId}/permissions/{userUid}`

```json
{
  "email": "climber@example.com",
  "level": "read"
}
```

Optional guest-promotion compatibility:

```json
{
  "email": "climber@example.com",
  "level": "edit",
  "guestCode": "AB12CD34"
}
```

Notes:
- This collection is used for signed-in shared access checks and the owner-facing shared user list.
- `level` is either `read` or `edit`.

## `users/{uid}/sharedBoards`
Path: `/users/{uid}/sharedBoards/{boardId}`

```json
{
  "boardId": "boardId",
  "boardName": "The Church",
  "level": "edit",
  "guestCode": "AB12CD34",
  "sharedAt": "Timestamp"
}
```

Notes:
- This is the canonical per-user list used to load shared boards after sign-in.
- `guestCode` is only stored when a guest session is promoted into a signed-in membership.

## `accessCodes`
Path: `/accessCodes/{code}`

```json
{
  "boardId": "boardId",
  "boardName": "The Church",
  "level": "edit",
  "ownerUid": "uid",
  "createdAt": "Timestamp"
}
```

Notes:
- Access codes are top-level documents keyed by the code string itself.
- Current client behavior generates unique 8-character uppercase codes with collision retries before write.

## `users/{uid}/trainingLogs`
Path: `/users/{uid}/trainingLogs/{boardId}`

```json
{
  "boardId": "boardId",
  "boardName": "The Church",
  "lastLoggedAt": "Timestamp"
}
```

Notes:
- This is the private board-scoped logbook root for one signed-in user.
- Training logs are not shared with board owners or other shared users.

## `users/{uid}/trainingLogs/{boardId}/sessions`
Path: `/users/{uid}/trainingLogs/{boardId}/sessions/{dateKey}`

```json
{
  "boardId": "boardId",
  "boardName": "The Church",
  "dateKey": "2026-04-08",
  "entryCount": 4,
  "completedCount": 3,
  "notCompletedCount": 1,
  "updatedAt": "Timestamp"
}
```

Notes:
- `dateKey` is stored as `YYYY-MM-DD` in local calendar terms.
- Session documents are monthly-calendar/day-summary records for the current board.

## `users/{uid}/trainingLogs/{boardId}/sessions/{dateKey}/entries`
Path: `/users/{uid}/trainingLogs/{boardId}/sessions/{dateKey}/entries/{entryId}`

```json
{
  "problemId": "problemId",
  "problemName": "warmup right",
  "problemGrade": "V2",
  "completed": true,
  "note": "Felt smooth after warming up shoulders.",
  "loggedAt": "Timestamp"
}
```

Notes:
- Each save creates a new attempt record, even for the same problem on the same day.
- `problemName` and `problemGrade` are denormalized snapshots so history survives later problem edits or deletes.

## Local Device State

The app also stores lightweight local state in `localStorage`:

- `wallywall:selectedBoardId`
  - last explicitly opened owner/member board
- `wallywall:guestSession`
  - remembered guest access for the current device
  - shape:

```json
{
  "boardId": "boardId",
  "boardName": "The Church",
  "code": "AB12CD34",
  "level": "read",
  "grantedAt": "2026-04-08T09:00:00.000Z"
}
```
