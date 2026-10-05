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

**Status:** Reviewed — approved with one required follow-up

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
- Confirm the documented forward-only operator policy is accurate.
- Confirm the stronger quickstart checks the actual webhook-processing and
  event-polling contract, using the canonical event ID returned by the gateway.

**Claude review:** Claude reviewed commit `e37058b` in [GitHub Actions run
#18](https://github.com/abdulrasaq-oniguguru/AfriStack/actions/runs/37294267472).
Fresh, restarted, and both legacy-database adoption paths passed; CI and the
stronger quickstart passed. One required follow-up remains before M5: serialize
concurrent gateway startup migrations.

## M2.1 — concurrent migration startup remediation

**Status:** Reviewed — migration race fixed; one required follow-up

**Scope:** The whole migration sequence now executes in one transaction after
taking `pg_advisory_xact_lock(hashtext('africa-dev-gateway:migrations'))`.
Concurrent instances wait for the first migrator, then read the completed
ledger. The migration guide now documents this behavior and explains why legacy
events with no safely attributable project remain hidden from project-scoped
event polling.

**Reviewer checklist:**

- Confirm the advisory lock is acquired before `schema_migrations` is created.
- Confirm the lock lifetime and the outer transaction prevent concurrent DDL
  races without leaving a partially applied migration ledger.
- Confirm the operator guidance no longer requires a single-instance startup.

**Claude review:** Claude reviewed commit `73ef6a2` in [GitHub Actions run
#19](https://github.com/abdulrasaq-oniguguru/AfriStack/actions/runs/37295548031).
The migration race was fixed in eight three-gateway startup runs. One required
follow-up remains before M5: serialize bootstrap project creation when multiple
instances initialize a fresh database together.

## M2.2 — concurrent bootstrap project creation remediation

**Status:** Reviewed — approved

**Scope:** Bootstrap project creation now takes a dedicated transaction-scoped
advisory lock before checking for the bootstrap key prefix and inserting a
project/key pair. The migration guide includes a diagnostic query for databases
initialized by older versions that may already contain duplicate key prefixes;
the service deliberately does not attempt an unsafe automatic project merge.

**Reviewer checklist:**

- Confirm concurrent fresh-database startup creates exactly one bootstrap
  project and key prefix.
- Confirm an existing key prefix returns its original project after the lock is
  acquired.
- Confirm the duplicate-prefix diagnostic is accurate and does not imply an
  automatic safe remediation.

**Claude review:** Claude reviewed commit `6bd1a39` in [GitHub Actions run
#20](https://github.com/abdulrasaq-oniguguru/AfriStack/actions/runs/37297081523).
The three-gateway fresh-database test created exactly one project and one
bootstrap key in all eight runs. M2 is complete.

## M3 — publishable packages

**Status:** Ready for review

**Scope:** Every public `@africa-dev/*` package now declares a description,
repository directory, homepage, bug tracker, keywords, Node `>=22` support, and
public scoped publish access. Tarballs are limited to `dist`, `README.md`,
`LICENSE`, and `package.json`; `prepack` builds before every pack. Changesets is
installed and targets the repository's `master` branch. The gateway remains
private.

**Evidence (2026-10-05):** All 11 public packages were packed into local
tarballs. The SDK and CLI packed manifests rewrite `workspace:^` dependencies
to `^0.1.0-alpha.0`. All tarballs installed together in a new empty npm project,
where `@africa-dev/sdk` imported successfully and `npm exec -- africa-dev
providers` completed successfully. The CLI bundle retains its Node shebang.

**Reviewer checklist:**

- Inspect every tarball for only declared release assets; no source, tests,
  source maps, or environment files.
- Confirm all package metadata and `publishConfig.access` values are present.
- Confirm the complete tarball-set consumer install and SDK/CLI smoke results.
- Confirm `@africa-dev` scope access and that `apps/gateway` remains private.

## Planned subsequent review boundaries

| Milestone                   | Review trigger                                                | Expected focus                                              |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| M3 — publishability         | Package metadata and `npm pack --dry-run` audit               | Package contents, licensing, entry points, and secrets      |
| M4 — provider certification | Flutterwave sandbox script has passed with opt-in credentials | Request mapping, webhook verification, and evidence hygiene |
| M5 — release candidate      | CI is green and all earlier review findings are resolved      | Cross-cutting release readiness                             |

Do not treat a Claude review as a sandbox certification or a substitute for CI.
