# Firestore Data Model

## boards (top-level collection)
/boards/{boardId}
```json
{
  ownerUid: string,       // UID of the user who owns this board
  name: string,           // Friendly name, e.g. "Home Wall"
  imageUrl: string,       // URL to the board photo
  createdAt: Timestamp
}

## accessCodes (subcollection)
/boards/{boardId}/accessCodes/{codeString}
```json
{
  level: 'read' | 'edit', // Permission granted by this code
  createdAt: Timestamp
}
```

## problems (subcollection)
/boards/{boardId}/problems/{problemId}
```json
{
  title: string,          // e.g. "Big Pull Left"
  color: string,          // Hold color or label
  holds: [                // Array of holds, in relative coordinates
    { xRatio: number, yRatio: number, type: string }
  ],
  status: 'active'|'hold'|'complete',
  createdAt: Timestamp
}
```