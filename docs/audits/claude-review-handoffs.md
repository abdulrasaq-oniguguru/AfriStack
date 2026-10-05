# Claude review handoffs

This file is the review queue for release-critical milestones. It is intentionally
updated at meaningful boundaries, rather than asking for one broad final review.
Entries marked **Ready for review** have local evidence but have not been reviewed
by Claude. A reviewer must record the commit reviewed, findings, and disposition
before an entry becomes **Reviewed**.

## M1 — clean Docker mock smoke test in CI

**Status:** Ready for review

**Scope:** GitHub Actions now explicitly selects only the mock payment provider,
starts the Compose stack from a clean CI runner, waits for service health, runs
the credentials-free `pnpm quickstart`, captures logs on failure, and always
removes containers and the named Postgres volume.

**Why this is a release boundary:** A Docker image that builds but cannot start,
reach Postgres, or process the documented mock payment/webhook flow is not a
releasable gateway.

**Reviewer checklist:**

- Confirm `docker compose up -d --build --wait` cannot accidentally select a
  real provider or require credentials.
- Confirm the quickstart reaches the host-mapped gateway and verifies health,
  creation, retrieval, signed webhook handling, and duplicate suppression.
- Confirm failure diagnostics do not print secrets and cleanup executes on both
  success and failure.
- Check that this complements (rather than duplicates) the image-build step.

**Local evidence (2026-10-05):** With the explicit mock-only environment, a
freshly built image started successfully and `pnpm quickstart` completed gateway
health, mock-payment creation and verification, signed webhook acceptance,
canonical `payment.succeeded` normalization, and duplicate suppression. The
local test containers were removed afterwards while preserving the developer's
existing Postgres volume.

**Evidence still required before review:** the GitHub Actions URL and commit
after this change is committed and pushed.

```powershell
$env:COREPACK_HOME='C:\Users\asoniguguru\PycharmProjects\AfriStack\.corepack'
$env:CI='true'
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test -- --reporter=dot
corepack pnpm build
docker compose up -d --build --wait
corepack pnpm quickstart
docker compose down --volumes --remove-orphans
```

## Planned subsequent review boundaries

| Milestone                      | Review trigger                                                                          | Expected focus                                              |
| ------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| M2 — database upgrade strategy | Versioned migrations, or an explicit supported startup-schema upgrade policy with tests | Data safety and operator recovery                           |
| M3 — publishability            | Package metadata and `npm pack --dry-run` audit                                         | Package contents, licensing, entry points, and secrets      |
| M4 — provider certification    | Flutterwave sandbox script has passed with opt-in credentials                           | Request mapping, webhook verification, and evidence hygiene |
| M5 — release candidate         | CI is green and all earlier review findings are resolved                                | Cross-cutting release readiness                             |

Do not treat a Claude review as a sandbox certification or a substitute for CI.
