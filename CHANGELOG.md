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
