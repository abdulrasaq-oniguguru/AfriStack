# Package dependencies

Reviewed 2026-10-04. Arrows point from a consumer to the package it imports.

```text
apps/gateway ─┬─> provider-paystack ─────> payments-core ─> country-data ─> core
              ├─> provider-flutterwave ──> payments-core
              ├─> provider-termii ───────> messaging-core ─> payments-core
              ├─> provider-africastalking -> messaging-core
              ├─> testkit ───────────────> payments-core
              └─> country-data / core

sdk ──────────> payments-core / messaging-core / core
cli ──────────> country-data / testkit
```

Concrete provider packages are leaves: generic payment and messaging packages do not import Paystack, Flutterwave, Termii, or Africa's Talking. There are no `if provider === ...` branches in canonical payment services.

`messaging-core` currently reuses the generic HTTP transport type from `payments-core`. This is an acceptable directed dependency for v0.1, but if another transport-using domain is introduced, the transport contract should move to `core` rather than making that domain depend on payments.
