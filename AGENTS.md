# WallyWall Session Notes

## Product Intent
- WallyWall is a board-first climbing wall app for private home boards.
- The main experience should stay focused on the board image first, with minimal clutter.
- Secondary tools should live in sheets, menus, or compact overlays rather than replacing the board view.

## Current Functional Scope
- Board owners can upload a board photo and create, edit, and delete problems.
- Problems store holds, grade, name, and optional notes.
- Access model supports:
  - owner
  - signed-in shared member
  - guest by code
- Guest access is remembered explicitly on-device and can be removed from the menu.
- Signed-in users on owned or saved shared boards can use the private training log.
- Training log supports:
  - quick logging from the top bar for the selected problem
  - completed / not completed result
  - optional short note
  - board-scoped calendar history
  - CSV and JSON export

## Key UX Constraints
- Keep the board pinned high under the top bar for maximum usable image area.
- Read mode should feel calm and minimal.
- The bottom selected-problem rail should stay tappable in read mode so long descriptions are accessible in the details sheet.
- Edit/create mode should keep controls pinned independently of board zoom.
- Zoom and pan must allow reaching the full image bounds.
- Menus should stay visually separated and readable on narrow mobile widths.

## UI Direction
- Visual style is a lighter graphite dark mode with stronger color accents.
- Accent roles currently:
  - menu and Problems: blue
  - Log: green
  - new problem: amber
  - edit problem: violet
  - zoom controls: blue
- The user wants the app to feel more refined, bolder, cleaner, and more intentional rather than flat grey.

## Important Files
- `public/app.js`
  Main orchestration layer. Still large and the biggest candidate for future splitting.
- `public/style.css`
  Full visual system and layout styling. Also large and likely worth modularizing later.
- `public/index.html`
  App shell, sheets, quick log, training log, and top bar markup.
- `public/firebase/firestore.js`
  Firestore read/write helpers, including training log helpers.
- `public/trainingLog.js`
  Calendar/date helpers for the training log.
- `firestore.rules`
  Includes private `users/{uid}/trainingLogs/...` rules.

## Data Model Notes
- Training logs live under:
  - `users/{uid}/trainingLogs/{boardId}`
  - `users/{uid}/trainingLogs/{boardId}/sessions/{dateKey}`
  - `users/{uid}/trainingLogs/{boardId}/sessions/{dateKey}/entries/{entryId}`
- Log data is private per user, not shared with the board owner or other members.
- Problem name and grade are denormalized into training entries so history survives later problem edits.

## Known Technical Notes
- There are still no real automated tests.
- `npm run build` is the only meaningful local verification script right now.
- `npm test` is still the placeholder script and should not be treated as real coverage.
- Firebase Hosting serves from `public/`.
- The generated `.firebase/hosting.cHVibGlj.cache` file is local deploy noise and usually should not be committed.

## Known Cleanup Targets
- Split `public/app.js` into smaller modules:
  - board/session access
  - training log flow
  - board zoom/gesture handling
  - placement/edit orchestration
- Split `public/style.css` into smaller sections or files when the current design stabilizes.

## Current Live App
- Hosting URL: `https://wallywall-18303.web.app`

## Suggested Next Checks
- Re-test zoom/pan on mobile and desktop at higher zoom levels.
- Keep tuning control saturation so accents feel strong but coordinated.
- Add proper lint and test scripts when the current UX pass settles.
