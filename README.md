# WallyWall

WallyWall is a board-first climbing wall app for private home boards. Owners can upload a board photo, annotate problems directly on the image, share read or edit access with guest codes, and let signed-in visitors keep that access for future sessions.

## Current Product Shape

- Full-screen board-first mobile UI
- Problem browsing with grade filter, bottom context rail, and swipe/arrow navigation
- Placement-first problem creation and editing
- Private training log for signed-in users on saved boards
- Secondary `Review` tab inside the training log for compact board summaries
- CSV and JSON export for board-scoped training history
- Owner, signed-in member, and guest-by-code access model
- Remembered guest access on-device, with explicit removal from the menu
- Firebase Auth, Firestore, Storage, and Hosting

## Main User Flows

### Board owner
- Sign in
- Create a board with name + board photo
- Add and edit problems directly on the board image
- Generate read/edit guest codes
- Revoke signed-in shared users

### Guest
- Join a board with a code
- Browse problems immediately
- If the code is edit-level, create and edit problems
- Keep access remembered on the device until it is removed

### Signed-in shared user
- Join with a code while signed in, or sign in after a guest visit
- Keep shared board access in the account
- Reopen the board from the shared boards list without relying on guest restore
- Log attempts privately against the current saved board

## Frontend Structure

- [public/app.js](/Users/lukemaggs/Desktop/Desktop/wallywall/public/app.js): main app orchestration and Firebase-backed flows
- [public/ui.js](/Users/lukemaggs/Desktop/Desktop/wallywall/public/ui.js): DOM map, sheets, confirm dialog, toasts
- [public/problemEditor.js](/Users/lukemaggs/Desktop/Desktop/wallywall/public/problemEditor.js): board overlay marker editor
- [public/accessHelpers.js](/Users/lukemaggs/Desktop/Desktop/wallywall/public/accessHelpers.js): access/session helpers
- [public/problemBrowser.js](/Users/lukemaggs/Desktop/Desktop/wallywall/public/problemBrowser.js): grade sorting and selected-problem navigation
- [public/gradeUtils.js](/Users/lukemaggs/Desktop/Desktop/wallywall/public/gradeUtils.js): shared grade ranking helpers for browsing and training review
- [public/problemDraft.js](/Users/lukemaggs/Desktop/Desktop/wallywall/public/problemDraft.js): draft baselines and dirty-state handling
- [public/trainingLog.js](/Users/lukemaggs/Desktop/Desktop/wallywall/public/trainingLog.js): month/day training-log helpers, review aggregation, and formatting
- [public/style.css](/Users/lukemaggs/Desktop/Desktop/wallywall/public/style.css): graphite dark visual system and board-first UI styling
- [tests/](/Users/lukemaggs/Desktop/Desktop/wallywall/tests): Vitest utility coverage for grade, browser, and training-log helpers

## Local Development

Install dependencies:

```bash
npm install
npm --prefix functions install
```

Run the frontend locally:

```bash
npm run dev
```

Build the production bundle:

```bash
npm run build
```

Run the utility tests:

```bash
npm test
```

## Deployment

This project is configured for Firebase project `wallywall-18303`.

Deploy Hosting only:

```bash
firebase deploy --only hosting
```

Deploy rules + hosting:

```bash
firebase deploy --only firestore:rules,storage,hosting
```

Deploy everything, including functions:

```bash
firebase deploy
```

Note:
- Functions predeploy runs `npm --prefix functions run lint`.
- The Vite build outputs to `dist/`, but Firebase Hosting currently serves from `public/`. If you want Hosting to serve the built bundle instead of source files, switch `firebase.json` hosting `public` to `dist` as a separate change.

## Current Caveats

- Automated coverage is now utility-level only; UI regression is still largely manual.
- Firebase Hosting is currently configured to serve `public/` directly.
- Training log review is board-scoped and intentionally lightweight; export is still the deeper analysis path.
