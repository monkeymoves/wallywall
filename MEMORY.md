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
- Top bar in read mode should stay minimal:
  - hamburger menu
  - board name
  - Problems
  - create problem
- Problem name/grade should not compete with the board title in the header.
- Account is now folded into the menu instead of living as a separate top-bar control.
- Board switching and board access management live together inside the Boards sheet.
- Edit/create controls use a dynamic mode-specific toolbar rather than the normal header.
- Metadata editing for problems sits below the board or in details, not in the main header.
- Tool colors are semantic:
  - Start: green
  - Hold: amber
  - Finish: purple
  - Erase hold: red
- Delete is intentionally separated and double-confirmed.

## Things That Were Explicitly Rejected
- Sidebar-first layout
- auth flow that silently turns failed sign-in into sign-up
- large persistent bottom trays that steal too much board space
- keeping create/edit metadata forms open over the board while placing holds
- leaving explanatory helper text on screen after the user has started editing
- a large separate Account button in the main non-edit header
- a header that tries to show both board context and problem context at once

## Backend Notes
- Canonical shared board membership should come from:
  - `/users/{uid}/sharedBoards/{boardId}`
- Board permissions still exist at:
  - `/boards/{boardId}/permissions/{userUid}`
- A previous legacy compatibility path that queried permissions during auth caused permission-denied noise and has now been removed from the client auth flow.

## Known Next UI Opportunities
- Make the menu feel more Apple-like and less like a generic dark web sheet:
  - fewer boxed sections
  - cleaner row hierarchy
  - less copy
- Keep simplifying the non-edit header so it feels lighter and more premium.
- Compress the selected problem strip further so it reads as lightweight context.
- Refine spacing and border treatment across the whole app to remove the remaining “retro / chunky” feel.
- Make the shared boards / board access areas easier to navigate without leaving the menu entirely.

## Known Next Functional Checks
- Confirm there are no remaining Firestore permission errors on fresh sign-in for shared users.
- Confirm shared boards appear correctly for users who already have:
  - `/users/{uid}/sharedBoards/{boardId}`
  - matching `/boards/{boardId}/permissions/{uid}`
- If permission errors still appear, inspect only the current canonical shared-board read path before adding any more compatibility logic.
