# v0.1 requirements

## Product boundary

The project is a self-hostable abstraction and control layer. Users own provider accounts and funds. The project must not hold balances, pool funds, become merchant of record, expose provider secrets to browsers, or accept raw card details.

## Required v0.1 behavior

1. A developer can create, verify, fetch, and refund payments through one TypeScript contract.
2. The same application call can target mock, Paystack, or Flutterwave through configuration.
3. A complete mock purchase works without credentials or network access.
4. Webhook verification uses untouched bytes and emits canonical, deduplicatable event identities.
5. Provider and country capability claims are data with source URLs and verification dates.
6. Financial mutations require an idempotency key. Gateway mode persists it atomically.
7. Automatic cross-provider retry is forbidden once a mutation may have reached a provider.
8. Logs and thrown messages do not include full secrets, card data, or OTPs.
9. Ordinary CI runs without personal credentials. Opt-in sandbox tests are separate.
10. The repository passes typecheck, lint, unit/contract tests, build, container health, and the mock quickstart.

## Current milestone status

- Foundation contracts, registries, money helpers, errors, SDK routing: implemented.
- Stateful mock provider: implemented.
- Paystack and Flutterwave adapters: implemented against documented HTTP contracts; sandbox certification pending.
- Gateway, PostgreSQL idempotency and durable webhook ingestion: next milestone.
- CLI and messaging: after the gateway payment path is stable.
- Identity, mobile-money-specific workflows, and offline sync: architecture only before v0.1.
