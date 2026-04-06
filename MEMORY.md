# WallyWall Memory

## Product Direction
- WallyWall is a board-first climbing app for private walls and shared guest/member use.
- Core access model:
  - owner
  - signed-in member
  - guest via code
- Primary use cases:
  - browse a board and select problems quickly
  - create and edit problems with minimal friction
  - let friends use the wall without mandatory account creation

## Current UX Principles
- The board image is the hero. Maximise visible board area on mobile.
- Read mode and edit mode should feel distinct.
- Creating/editing a problem should be placement-first:
  1. place holds
  2. open details for name/grade/notes
  3. save
- Details and destructive actions should not obscure the board unless explicitly opened.
- Hints should be temporary and disappear once the user starts interacting.

## Current UI Decisions
- Top bar is compact and keeps only core board navigation:
  - Boards
  - Problems
  - create/edit actions when relevant
  - account
- Board switching and board access management live together inside the Boards sheet.
- Edit controls live in a compact bottom dock inside the board frame.
- Tool colors are semantic:
  - Start: green
  - Hold: amber
  - Finish: purple
  - Delete: red
- Delete is intentionally separated and double-confirmed.

## Things That Were Explicitly Rejected
- Sidebar-first layout
- auth flow that silently turns failed sign-in into sign-up
- large persistent bottom trays that steal too much board space
- keeping create/edit metadata forms open over the board while placing holds
- leaving explanatory helper text on screen after the user has started editing

## Known Next UI Opportunities
- Compress the selected problem card into a thinner strip.
- Make the edit toolbar feel even more like a purpose-built board tool rail.
- Further refine the header composition and spacing.
- Keep reducing visual noise so the app feels closer to Kilter/Tension-class board apps.
