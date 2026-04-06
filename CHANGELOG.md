# WallyWall Change Log

## 2026-04-06

### Board-First Mobile Redesign
- Replaced the old sidebar-first mobile layout with a board-first shell.
- Added dedicated sheets for boards, access, account, join-by-code, create-board, and problem details.
- Moved the main board title and access state into the fixed top bar.
- Reworked the bottom action area so browsing and editing problems use separate states.

### Auth And Onboarding
- Split sign-in and account creation into separate explicit actions.
- Removed the old login flow that silently fell back to sign-up.
- Added a proper create-board flow with name plus image upload.
- Added a proper join-by-code flow for both guests and signed-in users.
- Persisted the last selected board locally.
- Persisted guest board access locally for the current device session.

### Board Sharing And Access
- Kept the existing owner / signed-in member / guest-by-code access model.
- Added clearer access presentation in the UI for owners, members, and guests.
- Added in-app guest code generation display and copy action for owners.
- Kept signed-in shared users visible in the access sheet with revoke controls.

### Problem Management
- Kept the board overlay editor but moved marker logic into a dedicated module.
- Added a dedicated problem details sheet for save/update.
- Added visible problem search feedback and filtered result chips.
- Improved mobile problem actions so the select and buttons no longer collapse into unreadable widths.
- Preserved the rule that guests can edit with an edit code but cannot delete.

### UI Infrastructure
- Replaced most `alert`, `prompt`, and `confirm` usage with in-app sheets, toasts, and a confirm dialog.
- Split the client logic into smaller modules:
  - `public/app.js`
  - `public/appState.js`
  - `public/problemEditor.js`
  - `public/ui.js`
  - `public/firebase/auth.js`
  - `public/firebase/firestore.js`

### Mobile Follow-Up Fixes
- Increased the board height on phone layouts so the wall uses more of the screen.
- Reduced horizontal padding to reclaim mobile real estate.
- Tightened the top bar and bottom tray spacing.
- Changed the problem action layout so buttons stack cleanly on narrow screens.
- Added a visible filtered-results row so search is still usable even when the select is not expanded.

### Board Overlay And Editing Fixes
- Fixed the board overlay so problem markers track the rendered board image instead of drifting into letterboxed margins.
- Added resize resync logic so marker placement stays aligned across screen sizes and orientation changes.
- Changed problem browsing to a simple grade-only filter in the Problems sheet.
- Moved delete out of the top bar and behind in-app confirmation.

### Mobile Board Layout Fixes
- Anchored the board to the top of the mobile viewport instead of centering it with dead space above.
- Let the board image use more of the available width on phones.
- Moved selected problem details below the board on mobile instead of floating over the image.

### Placement-First Editing Flow
- Split read mode from placement mode so entering edit/create no longer opens a large form over the board by default.
- Added a clear visual edit-state treatment to the board frame and top bar.
- Added floating hold-placement controls directly over the board during editing.
- Moved problem metadata editing behind an explicit `Details` action so hold placement stays visible.

### Navigation And Safety Cleanup
- Replaced the ambiguous top-bar management affordance with clearer labeled actions.
- Merged board switching and board access controls into a single Boards sheet to reduce top-bar clutter.
- Turned the problem details sheet into a proper editor with `Save`, `Close details`, and `Delete problem`.
- Added a second confirmation step before final problem deletion.

### UI Polish And Editing Workflow Refinement
- Refined the visual system with softer glass/charcoal surfaces, lighter borders, stronger hierarchy, and semantic edit tool colors.
- Tightened the header so board name and current problem metadata read more clearly at a glance.
- Changed create-mode guidance so the board remains the main workspace and metadata is deferred until needed.
- Moved the edit controls back into a compact bottom dock inside the board frame so they stay anchored during editing.
- Made placement hints transient and dismiss them as soon as the user interacts with the board or tool buttons.
- Removed the top-right `Step 2` overlay from the board to keep holds visible.
- Moved `Details` into the bottom action rail alongside the main editing actions.
- Separated delete into its own row in the details sheet and ensured confirmation dialogs layer cleanly above sheets.
