# africa-dev-infra

Build for African markets without integrating every provider yourself.

`africa-dev-infra` is an early-stage, open-source provider abstraction layer. Applications bring their own provider accounts and credentials; funds never pass through this project. The current implementation focuses on Nigeria payments and proves one canonical API across a local mock, Paystack, and Flutterwave.

> Alpha: the package APIs may change before v0.1. No production release has been published yet. Provider HTTP behavior is covered with deterministic adapter tests; live sandbox certification is still required before v0.1.

```ts
import { Africa } from "@africa-dev/sdk";
import { MockPaymentProvider } from "@africa-dev/testkit";

const africa = new Africa({
  country: "NG",
  payments: {
    providers: [new MockPaymentProvider()],
    strategy: "priority"
  }
});

const payment = await africa.payments.create({
  amountMinor: "500000",
  currency: "NGN",
  customer: { email: "customer@example.com" },
  reference: "ORDER-123",
  idempotencyKey: "create-ORDER-123"
});
```

Money is represented as integer minor-unit strings. `"500000"` NGN is NGN 5,000.00. This avoids floating-point errors and remains safe across JSON boundaries.

## What works today

| Capability                 | Mock        | Paystack             | Flutterwave         |
| -------------------------- | ----------- | -------------------- | ------------------- |
| Create hosted payment      | Tested      | Adapter-tested       | Adapter-tested      |
| Verify/get payment         | Tested      | Adapter-tested       | Adapter-tested      |
| Refund                     | Tested      | Adapter-tested       | Adapter-tested      |
| Verify webhook             | HMAC-SHA256 | HMAC-SHA512          | HMAC-SHA256         |
| Normalize webhook          | Tested      | Tested               | Tested              |
| Live sandbox certification | Local only  | Local gateway passed | Pending credentials |

“Adapter-tested” means requests, response validation, normalization, errors, and signatures are tested against recorded shapes from current official documentation using an injected HTTP transport. It does not mean a live provider sandbox was contacted in CI.

Messaging is available through direct SDK adapters: Termii supports SMS and OTP delivery/verification; Africa's Talking currently supports SMS only. Country coverage is intentionally only listed where the provider's current documentation supports it. See [Termii](docs/providers/termii.md) and [Africa's Talking](docs/providers/africastalking.md).

## Development

Requirements: Node.js 22+ and Corepack.

```sh
corepack pnpm install
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

The ordinary test suite requires no provider accounts or secrets. See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), and the [roadmap](ROADMAP.md).

## Docker mock quickstart

```sh
git clone https://github.com/abdulrasaq-oniguguru/AfriStack.git
cd AfriStack
corepack pnpm install
docker compose up -d --build
corepack pnpm quickstart
```

No provider account or credential is needed: without a local `.env`, Compose selects the mock provider. The quickstart creates and verifies a payment, delivers a correctly signed webhook twice, and proves that the duplicate delivery is ignored.

```text
✓ Gateway healthy
✓ Mock payment created (succeeded)
✓ Payment verified (succeeded)
✓ Webhook accepted
✓ Canonical event: payment.succeeded
✓ Duplicate webhook ignored
```

The fixed key is strictly for local development; production startup refuses to invent a bootstrap key.

For a server deployment behind an existing Caddy proxy, use `docker-compose.production.yml` with the base Compose file. It removes the public `4010` mapping and joins the external `skinnai_default` network using the internal hostname `africa-gateway`.

Generate a project configuration with:

```sh
corepack pnpm --filter @africa-dev/cli exec africa-dev init
```

## Provider safety

- Secret keys are server-side inputs only.
- Hosted checkout is used; this project does not collect raw card data.
- Webhook signatures are calculated over the untouched request bytes.
- A failed or timed-out financial mutation is never automatically sent to a second provider.
- Webhook payloads are notifications. Verify critical transaction facts with the provider before giving value.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Provider support is not listed until the adapter, contract tests, webhook verification, documentation, and sandbox evidence exist.

Licensed under [Apache-2.0](LICENSE).
