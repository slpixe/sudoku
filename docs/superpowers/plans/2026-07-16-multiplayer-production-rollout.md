# Multiplayer Production Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision and verify the merged multiplayer service on Neon, Fly.io, Cloudflare DNS, and Netlify without exposing credentials or changing the approved single-instance architecture.

**Architecture:** Neon PostgreSQL in `eu-west-2` is the durable store, one Fly Machine in `lhr` is the authoritative Socket.IO service, Cloudflare publishes `multi.sudoku.slpixe.com` directly to Fly, and Netlify injects that public endpoint into the production Vite build. Provider mutations are strictly ordered so each layer is healthy before the next layer is changed.

**Tech Stack:** Neon PostgreSQL, Fly.io, Fly Secrets, Cloudflare DNS, OpenTofu GitLab CI, Netlify, Node.js 24, Socket.IO, PostgreSQL migrations, pnpm 11.9.0.

## Global Constraints

- The public PWA remains `https://sudoku.slpixe.com`; the multiplayer service is `https://multi.sudoku.slpixe.com`.
- Fly app `sudoku-multiplayer` runs in organization `personal`, region `lhr`, with exactly one shared-CPU 512 MB Machine.
- Neon project `sudoku-multiplayer` stays in AWS London `eu-west-2`. The initial
  rollout may use its default production branch, database, and owner role to
  reduce first-release moving parts; this is a historical rollout allowance,
  not the canonical recommendation for future recreations. The canonical
  runbook uses one dedicated least-privilege application role shared by the
  runtime and migration runner.
- The pooled Neon URL must contain a `-pooler` hostname and `sslmode=require`.
- Fly Secrets is the only production secret store. Do not use BWS, 1Password, `.env`, GitHub secrets, Netlify, documentation, chat, or command arguments for `DATABASE_URL`.
- The DNS repository change is committed directly to `main` and pushed so its existing GitLab OpenTofu pipeline validates and applies it.
- Publish only the exact A, AAAA, or validation records returned by Fly. Initial Cloudflare records are DNS-only with automatic TTL.
- Never enable Fly HA, rolling multi-Machine overlap, Redis, autoscaling, or Cloudflare proxying during this rollout.
- Stop immediately on config, secret, DNS, certificate, migration, readiness, CI, or browser-smoke failure.

---

### Task 1: Align the Operations Runbook With the Approved Rollout

**Files:**

- Modify: `docs/multiplayer-operations.md`
- Test: `server/src/deploymentConfig.test.ts`

**Interfaces:**

- Consumes: approved rollout design at `docs/superpowers/specs/2026-07-16-multiplayer-production-rollout-design.md`.
- Produces: a credential-safe operator runbook using Fly organization `personal`, Fly Secrets only, and the local domains repository workflow.

- [ ] **Step 1: Install the merged workspace exactly**

Run:

```bash
pnpm install --frozen-lockfile
```

Expected: the existing lockfile installs without modification.

- [ ] **Step 2: Add a failing deployment-configuration assertion**

Extend `server/src/deploymentConfig.test.ts` so the operations guide must contain the exact organization and domains-repository workflow and must not contain the old 1Password command:

```ts
expect(operations).toContain("fly apps create sudoku-multiplayer --org personal");
expect(operations).toContain("/Users/slpixe/web/me/domains/main.tf");
expect(operations).toContain("git push origin main");
expect(operations).not.toContain("op read");
expect(operations).not.toContain("<FLY_ORGANIZATION>");
```

- [ ] **Step 3: Run the focused test and confirm RED**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server exec vitest run src/deploymentConfig.test.ts
```

Expected: failure on the missing exact Fly organization/domains workflow or the retained `op read` example.

- [ ] **Step 4: Rewrite only the affected runbook sections**

Update `docs/multiplayer-operations.md` to:

- identify Fly Secrets as the sole production secret store;
- instruct the operator to enter the Neon pooled URL with a hidden terminal prompt and pipe it to `fly secrets import --stage`;
- use `fly apps create sudoku-multiplayer --org personal`;
- identify `/Users/slpixe/web/me/domains/main.tf`, direct `main` commit/push, and GitLab OpenTofu CI as the DNS workflow;
- retain the rule that Fly generates all DNS target values.

Use this non-echoing secret block verbatim:

```bash
(
  set -e
  set +x
  printf '%s' "Paste the pooled Neon DATABASE_URL: " >&2
  IFS= read -r -s DATABASE_URL
  printf '\n' >&2
  case "$DATABASE_URL" in
    postgres://*|postgresql://*) ;;
    *) printf '%s\n' "Expected a PostgreSQL URL" >&2; exit 1 ;;
  esac
  case "$DATABASE_URL" in
    *-pooler*sslmode=require*) ;;
    *) printf '%s\n' "Expected the pooled Neon URL with sslmode=require" >&2; exit 1 ;;
  esac
  printf '%s\n' "DATABASE_URL=$DATABASE_URL" | fly secrets import --stage --app sudoku-multiplayer
  unset DATABASE_URL
)
```

Remove the manual migration example that loads credentials from 1Password. The checked-in Fly release command remains the normal and only first-release migration path.

- [ ] **Step 5: Run focused and static checks**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server exec vitest run src/deploymentConfig.test.ts
pnpm exec prettier --parser markdown --check docs/multiplayer-operations.md
pnpm exec prettier --check server/src/deploymentConfig.test.ts
git diff --check
```

Expected: focused tests pass, formatting passes, and no whitespace errors are reported.

- [ ] **Step 6: Commit the runbook correction**

```bash
git add docs/multiplayer-operations.md server/src/deploymentConfig.test.ts
git commit -m "docs: finalize multiplayer production runbook"
```

---

### Task 2: Create and Secure the Fly Application

**Files:**

- Read: `server/fly.toml`
- Read: `server/Dockerfile`
- Append after successful checks: `.superpowers/deployments/multiplayer-production-report.md`

**Interfaces:**

- Consumes: authenticated Fly account `slpixe@gmail.com`, organization `personal`, and the private pooled Neon URL held by the operator.
- Produces: undeployed Fly app `sudoku-multiplayer` with validated configuration and staged secret name `DATABASE_URL`; no secret value enters the report.

- [ ] **Step 1: Reconfirm account and app-name availability**

Run:

```bash
fly auth whoami
fly orgs list
fly apps list
```

Expected: account `slpixe@gmail.com`, organization slug `personal`, and no existing `sudoku-multiplayer` app. If the app already exists under `personal`, inspect and reuse it instead of creating a duplicate.

- [ ] **Step 2: Create the app without deploying**

Run:

```bash
fly apps create sudoku-multiplayer --org personal
```

Expected: Fly confirms app `sudoku-multiplayer` in organization `personal`.

- [ ] **Step 3: Validate the checked-in production configuration**

Run:

```bash
fly config validate --strict --config server/fly.toml
```

Expected: validation succeeds for app `sudoku-multiplayer`, primary region `lhr`, one 512 MB VM definition, immediate deployment strategy, and both HTTP checks.

- [ ] **Step 4: Have the operator stage the private Neon URL**

The operator runs the exact hidden-input block from Task 1 in their own terminal. Do not request, read, echo, screenshot, or paste the URL through the agent conversation.

Then verify only the secret name:

```bash
fly secrets list --app sudoku-multiplayer
```

Expected: `DATABASE_URL` is listed as staged; no value is displayed.

- [ ] **Step 5: Record non-secret results**

Create `.superpowers/deployments/multiplayer-production-report.md` and record the Fly account, organization, app name, config-validation result, and confirmation that the secret name is staged. Do not record digests if Fly documents them as secret-adjacent, and never record the URL.

---

### Task 3: Establish the Fly Certificate and Apply DNS

**Files:**

- Modify in separate repository: `/Users/slpixe/web/me/domains/main.tf`
- Append: `.superpowers/deployments/multiplayer-production-report.md`

**Interfaces:**

- Consumes: Fly app from Task 2 and exact DNS/IP records returned by Fly.
- Produces: authoritative DNS records for `multi.sudoku.slpixe.com`, a completed GitLab OpenTofu pipeline, and a valid Fly certificate.

- [ ] **Step 1: Allocate Fly's recommended public addresses**

Run:

```bash
fly ips allocate --app sudoku-multiplayer
fly ips list --json --app sudoku-multiplayer
```

Expected: Fly allocates its recommended public ingress addresses and returns them as public JSON. Record each exact address and type in the deployment report.

- [ ] **Step 2: Request the certificate and exact DNS instructions**

Run:

```bash
fly certs add multi.sudoku.slpixe.com --app sudoku-multiplayer
fly certs setup multi.sudoku.slpixe.com --app sudoku-multiplayer
fly certs setup multi.sudoku.slpixe.com --json --app sudoku-multiplayer
```

Expected: Fly reports the required A/AAAA addresses and any ownership-validation CNAME. Save only these non-secret public values in the deployment report.

- [ ] **Step 3: Synchronize the domains repository**

Run in `/Users/slpixe/web/me/domains`:

```bash
git status --short --branch
git pull --ff-only origin main
```

Expected: clean `main` aligned with `origin/main`. Stop if unrelated local edits exist.

- [ ] **Step 4: Add exactly the Fly-requested records**

Edit `main.tf` with resource labels `multi-sudoku-a`, `multi-sudoku-aaaa`, and, only when Fly requests it, `acme-challenge-multi-sudoku`.

Every created `cloudflare_record` must use zone ID `5c01c1924037fcc91c4e6389d992f8d1`, `proxied = false`, and `ttl = 1`. The address resources use `name = "multi.sudoku"`; `multi-sudoku-a` uses `type = "A"` only when Fly returned an IPv4 address, and `multi-sudoku-aaaa` uses `type = "AAAA"` only when Fly returned an IPv6 address. Set each `content` field to the literal public address copied from the Task 3 Step 1 JSON before applying the patch. If Fly requests validation, use its literal record name, type, and target under resource label `acme-challenge-multi-sudoku`. The controller must inspect the final HCL diff and reject any descriptive text, shell variable, placeholder, or guessed record value before commit.

- [ ] **Step 5: Validate, commit, and push the small DNS change**

Run:

```bash
git diff --check
git diff -- main.tf
git add main.tf
git commit -m "dns: add multiplayer sudoku backend"
git push origin main
```

Expected: one focused commit reaches GitLab `main` and triggers the existing OpenTofu validate, plan, and apply pipeline. Do not run local OpenTofu.

- [ ] **Step 6: Wait for CI, DNS, and certificate validity**

After the GitLab pipeline succeeds, run:

```bash
dig +short A multi.sudoku.slpixe.com
dig +short AAAA multi.sudoku.slpixe.com
fly certs check multi.sudoku.slpixe.com --app sudoku-multiplayer
```

Expected: public DNS matches Fly's records and Fly reports a valid certificate. Stop before deployment if any value differs.

---

### Task 4A: Correct Fly Dockerfile Resolution

**Files:**

- Modify: `server/fly.toml`
- Test: `server/src/deploymentConfig.test.ts`

**Interfaces:**

- Consumes: the repository-root build context and `server/Dockerfile` monorepo image definition.
- Produces: a Fly build configuration whose Dockerfile path resolves relative to `server/fly.toml` while retaining the repository root as build context.

- [ ] **Step 1: Add a failing configured-path regression test**

Add this test to `server/src/deploymentConfig.test.ts`:

```ts
it("resolves the configured Dockerfile relative to fly.toml", async () => {
  const flyConfigPath = path.join(repositoryRoot, "server/fly.toml");
  const flyConfig = await readFile(flyConfigPath, "utf8");
  const configuredDockerfile = flyConfig.match(/^\s*dockerfile\s*=\s*"([^"]+)"/m)?.[1];

  expect(configuredDockerfile).toBe("Dockerfile");

  const dockerfilePath = path.resolve(path.dirname(flyConfigPath), configuredDockerfile ?? "");
  await expect(readFile(dockerfilePath, "utf8")).resolves.toContain("FROM node:${NODE_VERSION}");
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server exec vitest run src/deploymentConfig.test.ts
```

Expected: the new test fails because the configured value is
`server/Dockerfile`, and resolving it from `server/fly.toml` produces the
missing path `server/server/Dockerfile`.

- [ ] **Step 3: Apply the minimal Fly configuration correction**

Change only the build path in `server/fly.toml`:

```toml
[build]
  dockerfile = "Dockerfile"
```

Do not move `server/fly.toml`, change the build context, modify the Dockerfile,
or add a duplicate `--dockerfile` flag to the deployment wrapper.

- [ ] **Step 4: Run focused and static checks**

Run:

```bash
pnpm --filter @sudoku/multiplayer-server exec vitest run src/deploymentConfig.test.ts
pnpm exec prettier --check server/src/deploymentConfig.test.ts
fly config validate --strict --config server/fly.toml
git diff --check
```

Expected: all deployment-configuration tests pass, the TypeScript test is
formatted, Fly validates the configuration, and the diff has no whitespace
errors.

- [ ] **Step 5: Commit the correction**

```bash
git add server/fly.toml server/src/deploymentConfig.test.ts
git commit -m "fix: resolve Fly Dockerfile from config directory"
```

- [ ] **Step 6: Independently review before retrying deployment**

The reviewer must confirm that `Dockerfile` resolves to the checked-in
`server/Dockerfile`, the repository-root build context is unchanged, the test
would fail for the prior `server/Dockerfile` value, and no topology, runtime,
migration, secret, or provider setting changed.

---

### Task 4: Deploy the Backend and Verify Neon Persistence

**Files:**

- Read: `package.json`
- Read: `server/fly.toml`
- Read: `server/migrations/001_multiplayer_rooms.sql`
- Read: `server/migrations/002_timer_started.sql`
- Append: `.superpowers/deployments/multiplayer-production-report.md`

**Interfaces:**

- Consumes: staged `DATABASE_URL`, valid Fly certificate/DNS, and the checked-in container/migrations.
- Produces: one healthy production Machine with migrated Neon schema and public HTTPS/WSS endpoints.

- [ ] **Step 1: Confirm the pre-deploy gates**

Run:

```bash
fly secrets list --app sudoku-multiplayer
fly certs check multi.sudoku.slpixe.com --app sudoku-multiplayer
fly config validate --strict --config server/fly.toml
```

Expected: staged `DATABASE_URL`, valid certificate, and valid configuration.

- [ ] **Step 2: Confirm Neon recovery protection**

In the Neon console, confirm project `sudoku-multiplayer` has the expected point-in-time recovery or snapshot coverage for the rollout. Do not continue until the operator confirms it.

- [ ] **Step 3: Deploy through the single-instance wrapper**

Run from the Sudoku rollout worktree:

```bash
pnpm run deploy:multiplayer
```

Expected: image build succeeds, the release command applies both migrations transactionally, deployment uses the immediate strategy, and the wrapper finishes by enforcing one Machine.

- [ ] **Step 4: Verify topology and service checks**

Run:

```bash
fly scale show --app sudoku-multiplayer
fly status --app sudoku-multiplayer
fly checks list --app sudoku-multiplayer
```

Expected: exactly one 512 MB shared-CPU Machine in `lhr`; health and readiness checks pass.

- [ ] **Step 5: Verify public endpoints**

Run:

```bash
curl -fsS https://multi.sudoku.slpixe.com/health
curl -fsS https://multi.sudoku.slpixe.com/ready
curl -fsS https://multi.sudoku.slpixe.com/metrics
```

Expected: health and readiness return successful no-cache JSON; metrics returns aggregate process counters with no room, guest, command payload, or database identifiers.

- [ ] **Step 6: Record non-secret deploy evidence**

Append the image reference, release/migration result, Machine count/region/size, check status, and endpoint results to the deployment report. Never include logs containing connection strings or raw room payloads.

---

### Task 5: Configure Netlify and Prove the Live Product

**Files:**

- Read: `src/lib/multiplayer/createMultiplayerSocket.ts`
- Append: `.superpowers/deployments/multiplayer-production-report.md`

**Interfaces:**

- Consumes: healthy public Fly backend from Task 4 and the existing Netlify site `slpixe-sudoku` serving `sudoku.slpixe.com`.
- Produces: a production frontend bundle using `https://multi.sudoku.slpixe.com` and verified live/offline flows.

- [ ] **Step 1: Set the production-only Netlify variable**

In the Netlify site UI, add:

```text
VITE_MULTIPLAYER_URL=https://multi.sudoku.slpixe.com
```

Scope it to Production only. Do not add `DATABASE_URL`, Fly tokens, Neon credentials, preview origins, or a wildcard CORS origin.

- [ ] **Step 2: Trigger a production deploy from merged `master`**

Use Netlify's production deploy control to rebuild the current `master` commit after the variable is saved.

Expected: deploy succeeds and `https://sudoku.slpixe.com` serves the new multiplayer selection UI.

- [ ] **Step 3: Verify the production frontend/backend contract**

Use two separate browser profiles:

1. Create an Easy #1 online room from `https://sudoku.slpixe.com`.
2. Join from the second profile using the copied room link.
3. Confirm the header shows `2/2`, value and note changes synchronize, partner selection moves, pause/resume is shared, and room-wide undo works.
4. Open the room from a third guest profile and confirm the two-guest rejection.
5. Reload both accepted profiles and confirm an authoritative snapshot restores.

Expected: all steps succeed over secure WebSocket with no browser console errors.

- [ ] **Step 4: Verify offline Solo remains independent**

Warm the production PWA cache, select Solo, switch the browser offline, reload, and open another built-in puzzle.

Expected: Solo remains playable without a request to `multi.sudoku.slpixe.com`; Online actions show the connection requirement.

---

### Task 6: Publish the Rollout Record and Close the Production Branch

**Files:**

- Create: `docs/deployments/2026-07-16-multiplayer-production.md`
- Modify if commands changed during rollout: `docs/multiplayer-operations.md`

**Interfaces:**

- Consumes: sanitized non-secret report from Tasks 2-5.
- Produces: durable deployment record, reviewed operations updates, and a clean GitHub PR for documentation changes.

- [ ] **Step 1: Create the sanitized deployment record**

Record:

- Neon project/region and confirmation of pooled TLS use, without URL or role credentials;
- Fly app/organization/region, image reference, one-Machine topology, migration result, and certificate state;
- DNS commit and successful GitLab pipeline URL;
- Netlify production deploy URL/commit;
- endpoint and browser smoke results;
- any deviations from this plan and their resolution.

Run a secret scan before staging:

```bash
rg -n "postgres(ql)?://|FLY_API_TOKEN=|NETLIFY_AUTH_TOKEN=" docs/deployments/2026-07-16-multiplayer-production.md
```

Expected: no database URL or token assignment is present. The literal variable name `DATABASE_URL` may appear only without a value.

- [ ] **Step 2: Run final repository checks**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm test
pnpm build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Commit and push the production documentation branch**

```bash
git add docs server/src/deploymentConfig.test.ts
git commit -m "docs: record multiplayer production rollout"
git push -u origin codex/multiplayer-production
```

Expected: branch pushes without including `.superpowers` scratch reports.

- [ ] **Step 4: Open the documentation PR and update issue #38**

Create a ready-for-review PR against `master` summarizing the non-secret rollout evidence. Add a final issue #38 comment linking the production PR and public health/readiness checks. Do not reopen issue #38 solely for the deployment record.

## Execution Handoff

This rollout is intentionally sequential. Provider and DNS mutations must be executed one at a time, with the controller verifying each checkpoint before continuing. Secret entry remains an operator-only step; agentic workers must never request or handle the Neon connection string.
