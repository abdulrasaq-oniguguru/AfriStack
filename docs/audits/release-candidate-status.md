# Release-candidate handoff

Last updated: 2026-10-05.

## Current code state

`master` was pushed at commit `8fcb843657dcef1f319336a97b120f7c4544f9d9` (`fix: satisfy locked lint checks`). This is the release-candidate candidate commit; do not tag it until the remote CI workflow is green.

Codex is the sole code-changing agent. Any outside review must be read-only and must not create commits, branches, patches, or pushes unless explicitly requested by the repository owner.

## What is implemented and verified locally

- Normalized payment gateway with mock, Paystack, and Flutterwave v3 adapters.
- Gateway webhook ingestion verifies signatures, re-verifies the provider payment, deduplicates delivery, keeps payment transitions monotonic, and exposes project-scoped events through `GET /v1/events`.
- Duplicate provider references across projects are deliberately left unscoped and do not update either payment.
- Test API keys cannot create or revoke live API keys.
- Local Compose explicitly enables the mock provider. The production overlay requires `GATEWAY_BOOTSTRAP_API_KEY` and disables mock provider use.
- CLI startup works through symlinks and Windows paths.
- Secret redaction covers authorization, API-key variants, `verif-hash`, client secrets, and cookies.
- A credentials-free mock quickstart and a small Node gateway example exist.

Local evidence before the final one-line lint correction:

```text
pnpm typecheck        passed
pnpm lint             passed locally only after the strict dependency reinstall
pnpm test             47 tests passed
pnpm format:check     passed
docker compose config --quiet                              passed
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet  passed with an explicit bootstrap key
```

The local dependency directory was then recreated with:

```powershell
$env:CI='true'
corepack pnpm install --frozen-lockfile
```

That installed the lockfile-pinned `typescript-eslint 8.71.0`. `pnpm lint` passed with that exact dependency set after the final correction.

## CI gate — required before tag

Previous GitHub Actions runs failed only because the newer locked `typescript-eslint` rejected an unnecessary optional chain in `apps/gateway/src/postgres-repository.ts`. Commit `8fcb843` removes that chain.

The GitHub CLI is not installed in this workspace, so remote workflow status could not be queried from here. Check the Actions run for `8fcb843` in GitHub. It must complete successfully, including:

- lint;
- typecheck;
- tests;
- build;
- Docker image build.

The local Docker image rebuild was interrupted during dependency installation in this environment. A previous external review reported this environment's container TLS proxy as the source of the failure; CI's Docker build is the authoritative release gate.

## Remaining v0.1 release blockers

1. Confirm GitHub Actions is green for `8fcb843`, especially the Docker build.
2. Run the mock quickstart against a freshly built gateway image if CI does not already do this.
3. Obtain a real Flutterwave sandbox certification run. Do not claim Flutterwave sandbox certification before it succeeds.
4. Create the release-candidate notes and package audits before publishing or tagging a final `v0.1.0`.

## Deferred after the RC

- Versioned database migrations.
- Removing plaintext recipient data from message persistence.
- Publish-ready package metadata and `npm pack` validation.
- Ascending event polling semantics and environment-specific provider credentials.
- Express, Next.js server-side, and Django examples.
- M-Pesa, MTN MoMo, identity/KYC, offline sync, dashboards, and AI features.

## Resume commands

```powershell
$env:COREPACK_HOME='C:\Users\asoniguguru\PycharmProjects\AfriStack\.corepack'
$env:CI='true'
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test -- --reporter=dot
corepack pnpm build
corepack pnpm format:check
```

For the local mock flow:

```powershell
docker compose up -d --build
corepack pnpm quickstart
node examples/node-basic/index.mjs
```
