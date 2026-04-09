# Release Workflow

This is the repo's current safe shipping flow.

## Explain Like I'm 5

- `master` is the real app.
- A `branch` is your private copy to experiment in safely.
- A `pull request` is GitHub showing your private copy next to the real app.
- The `PR preview` is a temporary test website made from your branch.
- `merge to master` means "yes, add this change to the real app".
- `live auto deploy` means GitHub updates the real website for you.

In plain English:

1. Make a safe copy of the app.
2. Change things in that copy.
3. Ask GitHub to show the change.
4. Test the temporary preview website.
5. If it looks good, merge it.
6. GitHub updates the real website.

Very short version:

```text
safe copy -> test site -> approve -> real site updates
```

## What Is What

- `master` is the production branch.
- A feature branch is where you make and test a change safely.
- A pull request (PR) is the check gate before code reaches `master`.
- GitHub Actions runs the checks and Firebase deploys.

## Normal Change Flow

1. Start from the latest `master`.

```bash
git checkout master
git pull
```

2. Create a new branch for your change.

```bash
git checkout -b codex/my-change-name
```

3. Make your changes locally.

4. Run the checks before pushing.

```bash
npm test
npm run build
npm --prefix functions run lint
```

5. Commit and push the branch.

```bash
git add .
git commit -m "Describe the change"
git push -u wallyremote codex/my-change-name
```

6. Open a PR from your branch into `master`.

On GitHub:
- `base` should be `master`
- `compare` should be your branch

7. Wait for the PR checks to pass.

The PR workflow does this:
- installs dependencies
- runs tests
- builds the frontend
- lints the functions package
- deploys a Firebase Hosting preview

8. Test the preview URL posted on the PR.

9. Merge the PR into `master` when the preview looks good.

10. After merge, GitHub auto-deploys live from `master`.

Check the GitHub Actions run named `Deploy to Firebase Hosting on merge`, then verify the live site:

- [https://wallywall-18303.web.app](https://wallywall-18303.web.app)

## If Something Fails

- PR check fails before the Firebase step: fix the code, tests, build, lint, or lockfile issue on your branch.
- PR check fails on the Firebase preview deploy step: check GitHub Actions secrets or Firebase auth setup.
- Merge deploy fails on `master`: production did not update; fix the issue in a new branch and open another PR.

## Important Repo-Specific Notes

- Firebase Hosting currently serves `public/` directly.
- The Vite build output in `dist/` is useful for verification, but it is not the current Hosting source.
- The remote for this repo is `wallyremote`.

## Very Short Version

```text
branch -> checks -> PR preview -> test preview -> merge to master -> live auto deploy
```
