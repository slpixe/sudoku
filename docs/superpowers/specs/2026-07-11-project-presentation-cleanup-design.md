# Project Presentation Cleanup Design

## Objective

Present this repository as Dean Quinney's actively maintained Sudoku portfolio project without misrepresenting the upstream work on which it is based. Preserve application behavior while simplifying imported history, refreshing public-facing documentation, and retiring unused GitHub Container Registry publishing.

## Attribution and provenance

- Preserve the existing MIT license and Tom Nick's copyright notice.
- Add a 2026 copyright notice for Dean Quinney's modifications.
- Describe the project as originally created by Tom Nick and substantially modernized and maintained by Dean Quinney.
- Do not claim that Dean created the upstream application, its original feature set, or its original motivation.
- Replace the inherited first-person Grandma story because it describes the upstream author's motivation, not Dean's.

## Git history design

The ownership boundary is the existing upstream tip `165dcdb` (`Add e2e coverage for custom sudoku creation (#40)`). Dean's work begins at `ace4f79` (`fix: improve sudoku generation and e2e reliability`).

Replace every commit through `165dcdb` with one root commit whose subject is exactly `init`. Dean will be the author and committer because he is creating the import commit. The commit body must state that its tree is an imported upstream baseline, identify the source project and upstream tip, and direct readers to the README and license for attribution.

Replay all commits after `165dcdb` in their current topological order, preserving:

- Dean's author name and email;
- original author dates;
- commit subjects and bodies;
- file contents at the final tree;
- meaningful merge structure where Git can reproduce it safely.

Commit hashes and committer dates will necessarily change. The rewritten branch must have the same final tree as the pre-rewrite `master` plus the separately approved cleanup changes.

## Safety model

Before rewriting history:

1. Confirm the working tree is clean and local `master` matches `origin/master`.
2. Record the original tip and upstream boundary hashes.
3. Create a local backup branch and a portable Git bundle containing all refs.
4. Build and validate the rewritten history on a temporary branch.
5. Compare the rewritten final tree with the expected cleanup tree.
6. Run the full project verification suite on the rewritten branch.
7. Show the proposed commit graph, author summary, tree comparison, and backup locations to the user.
8. Request explicit approval before replacing local `master` or force-pushing GitHub.

The remote update must use `--force-with-lease`, never an unconditional force push. Existing pull requests, links to old commits, forks, and clones will retain or reference the old hashes and may require manual reconciliation.

## README and repository presentation

Rewrite the README as a concise portfolio-quality project page with:

- the project name and a short product-focused summary;
- a live demo link to `https://sudoku.slpixe.com`;
- current desktop and mobile screenshots from `public/screenshots/`;
- a compact feature overview covering gameplay, notes, persistence, PWA/offline support, touch and keyboard interaction, accessibility, and internationalization;
- a technical overview naming React, TypeScript, Vite, Tailwind, Vitest, Playwright, and pnpm;
- accurate local development and verification commands;
- Docker instructions for optional local/self-hosted builds, without advertising a pre-built GHCR image;
- a brief project-history section with the approved upstream attribution;
- the existing license and issue links.

Remove the manually hard-coded “build passing” badge. If a build badge is retained, it must report the actual `Run tests` GitHub Actions workflow rather than a static value.

Update source-controlled stale identity references that affect the public application, including the error-report issue title that currently names `sudoku.tn1ck.com`. Keep translated upstream creator acknowledgements unless a separate UI attribution design is approved; they remain factually correct.

## GitHub Container Registry cleanup

Remove `.github/workflows/container_image.yaml` so pushes to `master` no longer publish `ghcr.io/slpixe/sudoku`. Retain the `Dockerfile` and local Docker instructions because they are useful self-hosting assets and do not depend on GitHub Packages.

Deleting existing GitHub package versions is a separate destructive remote action. It may occur only after the publishing workflow is removed and after the user approves the exact package deletion. The current GitHub token lacks `read:packages`, so package inventory or deletion may require re-authentication with package scopes or manual GitHub UI work.

## GitHub listing design

After source changes and history are ready, configure the repository with:

- visibility: public, but only after a secret scan and explicit user approval;
- description: `A polished, offline-ready Sudoku game built with React and TypeScript.`;
- homepage: `https://sudoku.slpixe.com`;
- topics: `sudoku`, `react`, `typescript`, `vite`, `pwa`, `playwright`, `tailwindcss`;
- issues enabled;
- wiki and discussions left disabled unless requested later.

Repository visibility, description, homepage, topics, and packages are external GitHub state. Present the exact commands or changes and request approval before applying them.

## Verification

The cleanup must not change gameplay or stored-data behavior. Verify with:

- `pnpm run typecheck`;
- `pnpm run lint`;
- `pnpm test`;
- `pnpm build`;
- `pnpm run test:e2e` because the public error-report link and README-visible application contract are being updated;
- a scan for stale `sudoku.tn1ck.com`, GHCR, and misleading creator claims;
- a comparison of the expected and rewritten Git trees;
- a secret scan before making the private repository public;
- a live check of `https://sudoku.slpixe.com` before publishing it as the GitHub homepage.

If the live-domain check cannot be completed, the README may be prepared with the requested URL locally, but GitHub homepage/visibility changes must wait until the user confirms that the Netlify custom domain is active.

## Out of scope

- Gameplay, styling, persistence, routes, puzzle data, solver, and generator behavior.
- Dependency upgrades or general refactoring.
- Removing local Docker support.
- Rewriting translated attribution to imply sole creation by Dean.
- Deleting packages, changing repository visibility, force-pushing, or otherwise mutating GitHub before a dedicated destructive-action approval.
