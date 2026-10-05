# Claude review handoffs

This file is the review queue for release-critical milestones. It is intentionally
updated at meaningful boundaries, rather than asking for one broad final review.
Entries marked **Ready for review** have local evidence but have not been reviewed
by Claude. A reviewer must record the commit reviewed, findings, and disposition
before an entry becomes **Reviewed**.

## M1 — clean Docker mock smoke test in CI

**Status:** Reviewed — approved

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

**Claude review:** Claude reviewed commit `5bd3830` in [GitHub Actions run
#17](https://github.com/abdulrasaq-oniguguru/AfriStack/actions/runs/37284461504).
All validation steps and the mock smoke test passed; the failure-log step was
correctly skipped and cleanup ran under `if: always()`. Approved with one
non-blocking finding: strengthen quickstart assertions for payment state,
webhook processing, and persisted events. That finding is being addressed in
M2.

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

## M2 — transactional database migrations and stronger smoke assertions

**Status:** Ready for review

**Scope:** The gateway now records ordered schema migrations in
`schema_migrations` and applies each migration plus its ledger record in one
PostgreSQL transaction. The initial migration adopts the former startup schema;
the second migration adds project-scoped webhook event storage. The quickstart
also now asserts successful payment states, first-delivery processing, and that
the processed canonical event is returned through `GET /v1/events`.

**Why this is a release boundary:** An operator needs a deterministic record of
which schema changes ran. A health check alone is insufficient if a deployment
can silently start against a partial or incompatible database schema.

**Local evidence (2026-10-05):** Typecheck and targeted lint passed; all 47
tests passed. A newly built gateway started successfully against the preserved
pre-migration Postgres volume, recorded `0001_initial` and
`0002_webhook_events_project_scope`, and completed the strengthened quickstart.

**Reviewer checklist:**

- Confirm migrations execute in order and an unsuccessful migration cannot be
  marked applied.
- Confirm an existing deployment with no migration ledger can adopt both
  migrations without data loss.
- Confirm the documented forward-only operator policy is accurate, including
  the current absence of a cross-instance advisory lock.
- Confirm the stronger quickstart checks the actual webhook-processing and
  event-polling contract, using the canonical event ID returned by the gateway.

## Planned subsequent review boundaries

| Milestone                   | Review trigger                                                | Expected focus                                              |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| M3 — publishability         | Package metadata and `npm pack --dry-run` audit               | Package contents, licensing, entry points, and secrets      |
| M4 — provider certification | Flutterwave sandbox script has passed with opt-in credentials | Request mapping, webhook verification, and evidence hygiene |
| M5 — release candidate      | CI is green and all earlier review findings are resolved      | Cross-cutting release readiness                             |

Do not treat a Claude review as a sandbox certification or a substitute for CI.
