# Project Presentation Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repository into an accurate, polished portfolio project, retire unused GHCR publishing, and prepare a safely curated history containing one attributed upstream baseline followed by Dean Quinney's genuine work.

**Architecture:** Make ordinary source and documentation changes on `master` first and verify them. Then create backups and build the rewritten graph on an isolated local branch using Git's native `commit-tree` and merge-preserving rebase functionality. Treat local branch replacement, force-push, repository visibility, metadata mutation, and package deletion as separate approval-gated operations.

**Tech Stack:** Git, GitHub CLI, Markdown, React 18, TypeScript, Vite, Tailwind CSS, pnpm 11.9.0, Vitest, Playwright, GitHub Actions, Docker.

## Global Constraints

- Preserve the final application behavior, puzzle data, routes, persistence, solver, and generator.
- Preserve `LICENSE`'s Tom Nick copyright notice and add Dean Quinney's modification notice.
- Use `https://sudoku.slpixe.com` as the requested canonical application URL, but do not make the GitHub repository public until the domain and secret scan are confirmed.
- Collapse commits through `165dcdb` into a root commit whose subject is exactly `init` and whose body identifies the imported upstream baseline.
- Preserve all commits after `165dcdb` as Dean's incremental history, including author identity, author dates, messages, content, and meaningful merge structure.
- Keep the `Dockerfile`; remove only automatic GHCR publishing and pre-built-image advertising.
- Do not delete packages, replace `master`, force-push, or make the repository public without explicit approval at the destructive-action checkpoint.

---

### Task 1: Refresh project presentation and retire GHCR publishing

**Files:**
- Modify: `README.MD`
- Modify: `LICENSE`
- Modify: `src/Root.tsx:79`
- Modify: `AGENTS.md`
- Delete: `.github/workflows/container_image.yaml`

**Interfaces:**
- Consumes: Current application features, `public/screenshots/sudoku-desktop.png`, `public/screenshots/sudoku-mobile.png`, GitHub Actions workflow `run_tests.yaml`.
- Produces: Accurate public documentation, canonical URL references, retained legal attribution, and a repository that no longer republishes GHCR images.

- [ ] **Step 1: Confirm the stale presentation references**

Run:

```bash
rg -n -i 'sudoku\.tn1ck\.com|my Grandma|GitHub Container Registry|ghcr\.io|Copyright' README.MD LICENSE src/Root.tsx .github AGENTS.md
```

Expected: README live-demo and story matches, the error-report URL match, the existing Tom Nick copyright, and GHCR workflow/README matches.

- [ ] **Step 2: Replace `README.MD` with the portfolio-focused project page**

Write this complete content:

```markdown
# Sudoku

[![CI](https://github.com/slpixe/sudoku/actions/workflows/run_tests.yaml/badge.svg)](https://github.com/slpixe/sudoku/actions/workflows/run_tests.yaml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 24+](https://img.shields.io/badge/node-%3E%3D24-brightgreen.svg)](https://nodejs.org/)

A fast, offline-ready Sudoku game with thousands of puzzles, touch-friendly controls, keyboard shortcuts, and local progress saving.

**Play it:** [sudoku.slpixe.com](https://sudoku.slpixe.com)

![Sudoku running on desktop](public/screenshots/sudoku-desktop.png)

<p align="center">
  <img src="public/screenshots/sudoku-mobile.png" alt="Sudoku running on mobile" width="320">
</p>

## Highlights

- More than 3,000 puzzles across five difficulty levels
- Full notes workflow with automatic notes, custom notes, and conflict highlighting
- Undo and redo, hints, completion statistics, and per-puzzle progress
- Installable PWA with offline play and update handling
- Responsive layouts and polished touch controls for phones and tablets
- Keyboard and number-pad navigation, including held-key note entry
- Light and dark themes with accessible controls
- Internationalized interface with automatic browser-language selection
- Custom puzzle creation with validation and solving support

## Technical overview

The application is built with React, TypeScript, Vite, and Tailwind CSS. Game progress and preferences are persisted locally, while routing supports compact, shareable puzzle URLs. The test suite combines Vitest unit coverage with Playwright end-to-end checks across light and dark themes, responsive viewports, persistence, gameplay, and PWA behavior.

Recent modernization work includes:

- pnpm-based local, CI, Docker, and Playwright workflows
- separated persistence, routing, and active-game ownership boundaries
- optimized rendering and code-split application bundles
- robust multi-tab game locking and recovery
- expanded accessibility, touch, keyboard, and offline coverage

## Development

### Requirements

- Node.js 24 or newer
- Corepack with the package-manager version pinned in `package.json`

```bash
git clone https://github.com/slpixe/sudoku.git
cd sudoku
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

The development server listens on [http://127.0.0.1:3000](http://127.0.0.1:3000) and is available to other devices on the local network.

### Verification

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
```

### Docker

Build and run an optional self-hosted container locally:

```bash
docker build -t sudoku:latest .
docker run --rm -p 8081:80 sudoku:latest
```

## Project history

Sudoku was originally created by [Tom Nick](https://github.com/TN1ck). This version is substantially modernized and maintained by [Dean Quinney](https://github.com/slpixe), with a focus on architecture, reliability, accessibility, touch interaction, PWA behavior, and automated testing.

The imported upstream baseline remains covered by its original MIT copyright notice. Dean's subsequent modifications are also released under the MIT License.

## License

Licensed under the [MIT License](LICENSE).

Found a problem or have an idea? [Open an issue](https://github.com/slpixe/sudoku/issues).
```

- [ ] **Step 3: Add Dean's modification copyright without altering the upstream notice**

Change the start of `LICENSE` to:

```text
MIT License

Copyright (c) 2023 Tom Nick
Copyright (c) 2026 Dean Quinney (modifications)

Permission is hereby granted, free of charge, to any person obtaining a copy
```

Leave every remaining license paragraph unchanged.

- [ ] **Step 4: Correct the public error-report origin**

In `src/Root.tsx`, replace only the stale domain in the issue-title URL:

```tsx
href={`https://github.com/slpixe/sudoku/issues/new?title=Bug%20report%20from%20sudoku.slpixe.com&body=error%20details%3A%0A%0A${error?.toString()}`}
```

- [ ] **Step 5: Record the new project-presentation decisions in `AGENTS.md`**

Insert after `# Project Notes`:

```markdown
## Presentation and Provenance

- The canonical public application URL is `https://sudoku.slpixe.com`.
- The application was originally created by Tom Nick and is substantially modernized and maintained by Dean Quinney; preserve that attribution in public documentation and the MIT license.
- The imported upstream history through `165dcdb` is represented by a single attributed `init` baseline; Dean's work begins at the original commit `ace4f79`.
- Automatic container-image publishing is retired. Keep the Dockerfile for local or self-hosted builds, but do not restore registry publishing unless explicitly requested.
```

- [ ] **Step 6: Remove the container-publishing workflow**

Delete `.github/workflows/container_image.yaml`. Do not change `.github/workflows/run_tests.yaml`.

- [ ] **Step 7: Verify the focused source diff**

Run:

```bash
git diff --check
git diff -- README.MD LICENSE src/Root.tsx AGENTS.md .github/workflows/container_image.yaml
rg -n -i 'sudoku\.tn1ck\.com|my Grandma|GitHub Container Registry|ghcr\.io' README.MD LICENSE src .github AGENTS.md
```

Expected: `git diff --check` passes; the diff contains only the planned presentation changes; the stale-reference scan returns no matches. Translated `created_by` strings naming Tom Nick remain unchanged.

- [ ] **Step 8: Run fast verification before committing**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
```

Expected: all four commands exit successfully.

- [ ] **Step 9: Commit the ordinary cleanup**

```bash
git add README.MD LICENSE src/Root.tsx AGENTS.md .github/workflows/container_image.yaml
git commit -m "docs: polish project presentation"
```

Expected: one new Dean Quinney commit containing the presentation cleanup.

### Task 2: Create safety backups and the isolated curated-history candidate

**Files:**
- Create: `.git/safety/sudoku-before-history-cleanup-2026-07-11.bundle`
- Git refs: `backup/pre-cleanup-2026-07-11`, `codex/curated-history`

**Interfaces:**
- Consumes: Clean, verified `master`; upstream boundary `165dcdb`; Dean identity `Dean Quinney <slpixe@gmail.com>`.
- Produces: A restorable bundle, an immutable local backup ref, and a candidate branch whose root is the attributed import commit.

- [ ] **Step 1: Reconfirm local and remote starting state**

Run:

```bash
git status --short --branch
git fetch origin master
git rev-parse master
git rev-parse origin/master
git rev-parse 165dcdb
git rev-list --count 165dcdb..master
```

Expected: clean working tree; local `master` is ahead of `origin/master` only by the approved design and cleanup commits; upstream boundary resolves to `165dcdba85f01624faf2acfd1524fdd8ac8bef63`; the incremental count is 93 after the cleanup commit.

- [ ] **Step 2: Create the backup ref**

Run:

```bash
git branch backup/pre-cleanup-2026-07-11 master
git show --no-patch --oneline backup/pre-cleanup-2026-07-11
```

Expected: the backup branch points to the verified cleanup tip.

- [ ] **Step 3: Create and verify a portable bundle**

Run:

```bash
mkdir -p .git/safety
git bundle create .git/safety/sudoku-before-history-cleanup-2026-07-11.bundle --all
git bundle verify .git/safety/sudoku-before-history-cleanup-2026-07-11.bundle
```

Expected: Git reports that the bundle is okay and contains all refs. The user's separate external backup remains recommended because `.git/safety` is inside the working repository.

- [ ] **Step 4: Create the attributed root commit from the exact upstream tree**

Run:

```bash
env GIT_AUTHOR_NAME="Dean Quinney" GIT_AUTHOR_EMAIL="slpixe@gmail.com" GIT_COMMITTER_NAME="Dean Quinney" GIT_COMMITTER_EMAIL="slpixe@gmail.com" git commit-tree '165dcdb^{tree}' -m "init" -m "Imported upstream baseline from https://github.com/TN1ck/sudoku at 165dcdba85f01624faf2acfd1524fdd8ac8bef63. Original project and contributor work are acknowledged in README.MD and LICENSE."
```

Expected: Git prints a new root commit hash. Record that exact hash as `ROOT_COMMIT` in the execution notes; do not invent or pre-fill it in this plan.

- [ ] **Step 5: Create and rebase the isolated candidate**

Run, replacing `ROOT_COMMIT` with the exact hash printed by Step 4:

```bash
git switch -c codex/curated-history master
git rebase --rebase-merges --onto ROOT_COMMIT 165dcdb
```

Expected: Git replays the 93 incremental Dean commits onto the new root. If a conflict occurs, resolve only mechanical history-replay conflicts; abort and return to the backup branch if the intended final content is uncertain.

- [ ] **Step 6: Prove final-tree equality and inspect history**

Run:

```bash
git diff --exit-code backup/pre-cleanup-2026-07-11 codex/curated-history
git rev-parse 'backup/pre-cleanup-2026-07-11^{tree}'
git rev-parse 'codex/curated-history^{tree}'
git rev-list --count codex/curated-history
git log --reverse --format='%h %an <%ae> %s' codex/curated-history
git shortlog -sne codex/curated-history
```

Expected: no tree diff; identical tree hashes; 94 total commits; the first subject is `init`; every commit author is Dean Quinney; all post-root subjects match the original incremental history.

### Task 3: Verify the complete curated candidate and audit public-readiness

**Files:**
- No planned source changes.
- Test artifacts may be generated in ignored directories.

**Interfaces:**
- Consumes: `codex/curated-history` candidate.
- Produces: Evidence that behavior is unchanged and the repository is safe to consider for public visibility.

- [ ] **Step 1: Run the complete project checks on the candidate**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
pnpm run test:e2e
```

Expected: every command exits successfully. Playwright uses its isolated preview server on port 4179.

- [ ] **Step 2: Scan the current tree for likely secrets and private keys**

Run:

```bash
git grep -IEn '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})'
```

Expected: no matches. Any match must be reviewed before public visibility; never print a real secret into chat or commit it to cleanup history.

- [ ] **Step 3: Scan the retained history for likely secrets**

Run:

```bash
git log -p --all -- . ':!sudokus/**' | rg -n '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})'
```

Expected: no matches. If matches exist, stop; secret remediation needs a separate design because the history plan would have to expand.

- [ ] **Step 4: Verify presentation references**

Run:

```bash
rg -n -i 'sudoku\.tn1ck\.com|my Grandma|GitHub Container Registry|ghcr\.io' README.MD LICENSE src .github AGENTS.md
rg -n 'Tom Nick|Dean Quinney|sudoku\.slpixe\.com' README.MD LICENSE AGENTS.md src/Root.tsx
git status --short --branch
```

Expected: no stale hosting/GHCR matches; accurate Tom and Dean attribution matches; clean candidate working tree.

- [ ] **Step 5: Verify the requested live URL**

Run with network access:

```bash
curl -I --max-time 10 https://sudoku.slpixe.com/
```

Expected: a successful HTTPS response. If this check is declined or fails, keep GitHub homepage and public-visibility changes paused until the user confirms Netlify's custom domain.

### Task 4: Present the destructive-action checkpoint

**Files:**
- No changes.

**Interfaces:**
- Consumes: Backup evidence, candidate graph, successful checks, secret scan, and domain result.
- Produces: A user decision authorizing or rejecting each remote/local destructive action.

- [ ] **Step 1: Report the exact candidate and recovery information**

Report:

- original remote tip and current local backup tip hashes;
- `backup/pre-cleanup-2026-07-11` ref;
- `.git/safety/sudoku-before-history-cleanup-2026-07-11.bundle` path and verification result;
- candidate tip/root hashes, commit count, author summary, and tree-equality result;
- every verification command and result;
- live-domain and secret-scan results;
- warning that force-push invalidates old commit URLs and requires existing clones to reconcile.

- [ ] **Step 2: Request separate explicit approval for destructive/external changes**

Ask for approval to:

1. replace local `master` with `codex/curated-history`;
2. force-push with an exact lease to GitHub;
3. set description, homepage, and topics;
4. make the repository public;
5. inspect and then delete the obsolete GHCR package.

Do not proceed merely because Tasks 1–3 succeeded.

### Task 5: Apply only the explicitly approved GitHub and branch changes

**Files:**
- Git refs and GitHub repository metadata only.

**Interfaces:**
- Consumes: Explicit approvals from Task 4 and the verified candidate.
- Produces: Curated `master`, polished GitHub listing, and optionally retired package state.

- [ ] **Step 1: Replace local `master` without discarding the backup ref**

Only after approval, while `codex/curated-history` is checked out:

```bash
git branch -f master codex/curated-history
git switch master
git status --short --branch
```

Expected: local `master` points to the candidate; backup branch and bundle remain intact.

- [ ] **Step 2: Recheck the remote lease and force-push safely**

Run:

```bash
git fetch origin master
git rev-parse origin/master
```

Compare the printed hash with the audited remote tip `68d1b4f150ad4cbb89a1bca8c014668494883e39`. If it differs, stop and investigate. If it matches, run:

```bash
git push --force-with-lease=master:68d1b4f150ad4cbb89a1bca8c014668494883e39 origin master
```

Expected: GitHub accepts the rewritten branch without overwriting any unexpected remote work.

- [ ] **Step 3: Set non-visibility GitHub listing metadata**

Only after metadata approval:

```bash
gh repo edit slpixe/sudoku --description "A polished, offline-ready Sudoku game built with React and TypeScript." --homepage "https://sudoku.slpixe.com" --add-topic sudoku --add-topic react --add-topic typescript --add-topic vite --add-topic pwa --add-topic playwright --add-topic tailwindcss
```

Expected: GitHub shows the description, homepage, and seven topics.

- [ ] **Step 4: Make the repository public**

Only after public-visibility approval, a clean secret scan, and a confirmed live domain:

```bash
gh repo edit slpixe/sudoku --visibility public --accept-visibility-change-consequences
gh repo view slpixe/sudoku --json visibility,description,homepageUrl,repositoryTopics,url
```

Expected: visibility is `PUBLIC` and the listing metadata matches Task 3.

- [ ] **Step 5: Inspect the obsolete package before deletion**

The current token lacks `read:packages`. Re-authenticate only with user approval, then inventory versions:

```bash
gh auth refresh -h github.com -s read:packages,delete:packages
gh api '/user/packages/container/sudoku/versions?per_page=100'
```

Expected: the command lists the exact container versions. Report them and request a final package-deletion confirmation; do not infer deletion approval from earlier history approval.

- [ ] **Step 6: Delete the package only after final confirmation**

After the user confirms the inspected package is obsolete:

```bash
gh api --method DELETE /user/packages/container/sudoku
```

Expected: GitHub returns success and the package disappears. Confirm `.github/workflows/container_image.yaml` is absent so it will not be recreated.

- [ ] **Step 7: Final verification and handoff**

Run:

```bash
git status --short --branch
git log --reverse --format='%h %ad %an <%ae> %s' --date=short master
git shortlog -sne master
gh repo view slpixe/sudoku --json visibility,description,homepageUrl,repositoryTopics,url
```

Expected: clean `master` tracking the rewritten remote; one attributed `init` root followed by Dean's incremental commits; one author identity in commit metadata; accurate public GitHub listing. Report the retained backup ref and bundle so the user can decide when to remove them in a later cleanup.
