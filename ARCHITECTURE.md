# Architecture

## Boundaries

```text
Application backend
    |                         direct mode
    +--> TypeScript SDK --------------------> Provider adapter --> Provider API
    |
    |                         gateway mode
    +--> TypeScript SDK --> REST gateway --> Provider adapter --> Provider API
                               |
                               +--> PostgreSQL (idempotency, events, audit)
```

Provider adapters own authentication, HTTP shape, provider amount units, status/error mapping, and signature verification. Canonical services must not branch on Paystack or Flutterwave details.

## Package responsibilities

- `@africa-dev/core`: errors, provider metadata/registry, secret-provider boundary.
- `@africa-dev/country-data`: currencies and source-backed country/provider capability data.
- `@africa-dev/payments-core`: canonical payment contract, exact money conversion, HTTP transport boundary.
- `@africa-dev/testkit`: stateful local mock and failure scenarios.
- `@africa-dev/provider-paystack`: Paystack mapping and HMAC-SHA512 verification.
- `@africa-dev/provider-flutterwave`: Flutterwave mapping and HMAC-SHA256 verification.
- `@africa-dev/sdk`: provider-neutral application API and conservative routing.

## Payment flow

`amountMinor` is a positive integer string. An adapter converts only at its boundary. Paystack receives subunits. Flutterwave Standard receives a decimal major-unit string. Provider response schemas are validated before normalization.

Priority routing selects the first configured adapter. It does not catch a dispatched mutation and try another adapter: a timeout is ambiguous and failover could double-charge the customer.

## Webhook flow

The HTTP gateway must capture raw bytes before JSON parsing. The adapter verifies those bytes, parses the event, and produces a deterministic canonical ID. The gateway then atomically inserts the provider event ID, acknowledges promptly, and schedules downstream processing. A unique database constraint, not an in-memory check, is the deduplication authority.

## Future compatibility

M-Pesa and MTN MoMo need asynchronous collection/disbursement contracts distinct from hosted checkout. They may reuse errors, registry, money, idempotency, and event infrastructure, but must not be forced into `PaymentProvider` where semantics differ. Identity data receives a separate privacy review and storage boundary.
