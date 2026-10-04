# ADR: Flutterwave v3 for payment v0.1

Status: accepted — 2026-10-04.

The v0.1 adapter uses Flutterwave v3 transaction endpoints: hosted checkout at `/v3/payments`, verification by transaction ID or `tx_ref`, and transaction refunds. Flutterwave’s v3 webhook contract uses the configured dashboard secret hash in the `verif-hash` header, compared with a constant-time equality check.

Flutterwave v4 documents a different webhook contract: base64 HMAC-SHA256 of raw request bytes in `flutterwave-signature`. It is deliberately not accepted by this v3 adapter. Accepting both formats would create a mixed-generation integration and make dashboard configuration ambiguous.

The adapter will move only in a deliberate future v4 migration that replaces transaction endpoints, identifiers, payload schemas, documentation, certification evidence, and webhook verification together.
