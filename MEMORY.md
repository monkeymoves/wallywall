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
  - Log (signed-in users on saved boards only)
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
- Storage writes for board layout images should stay scoped to `/layouts/{uid}/...` for the signed-in owner only.
- Board creation rules should always validate `ownerUid == request.auth.uid`.
- A previous legacy compatibility path that queried permissions during auth caused permission-denied noise and has now been removed from the client auth flow.

## Known Next UI Opportunities
- Keep refining the board-first graphite theme without reintroducing chunky cards or extra chrome.
- Continue tightening the menu hierarchy so board switching, sharing, and account controls feel fast to scan.
- Consider richer problem browsing states later:
  - grade pills
  - completion/history state
  - lightweight sorting
- When workout logging arrives, keep it out of the primary board view and behind the menu or a secondary sheet.
- Training log v1 now follows that rule:
  - top-bar `Log` opens a tiny attempt card for the selected problem
  - full history lives in a secondary calendar sheet from the menu
  - summary/review lives in a secondary tab inside that sheet rather than above the calendar
  - logs are private per user and scoped to the current board

## Current Engineering Notes
- Root `npm test` now runs a small Vitest suite for pure utility modules.
- Current automated coverage is intentionally limited to:
  - grade helpers
  - problem-browser helpers
  - training-log date/review aggregation helpers
- Board loading now has a token-based async guard so stale board reads do not overwrite the latest selection.

## Known Next Functional Checks
- Confirm remembered guest access behaves correctly across reload, sign-in promotion, and explicit removal from the device.
- Confirm swipe navigation always follows the currently filtered problem set.
- Confirm dirty-draft discard prompts appear only when create/edit state has actually changed.
