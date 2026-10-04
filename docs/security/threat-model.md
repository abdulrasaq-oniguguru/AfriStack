# Threat model

## Protected assets

Provider credentials, project API keys, payment integrity, webhook authenticity, customer contact data, audit history, and idempotency state.

## Trust boundaries and controls

| Threat                       | Control                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Forged webhook               | Provider-specific signature over exact raw bytes; reject before parsing/processing                |
| Replay/duplicate webhook     | Stable provider event identity plus database unique constraint                                    |
| Double charge after timeout  | Never cross-provider retry an ambiguous mutation; reconcile by verification                       |
| Duplicate concurrent request | Transactional idempotency record with request fingerprint and stored response                     |
| Credential disclosure        | Server-only configuration, symbolic environment references, redaction, no secret values in errors |
| Malformed provider response  | Runtime schema validation; fail closed as provider error                                          |
| Money rounding               | Integer minor units and currency exponent metadata; no floating-point arithmetic                  |
| Card-data scope expansion    | Provider-hosted checkout; never accept or store PAN/CVV                                           |
| Unbounded request abuse      | Gateway request-size limits, project authentication, rate limiting, safe headers                  |
| Sensitive payload retention  | Allowlist normalized fields; redact raw events; retention controls before production              |

## Residual risks

Provider documentation and behavior can diverge. Each adapter therefore records a verification date and requires opt-in sandbox certification. A valid webhook is not sufficient proof to fulfill an order: amount, currency, reference, and final state must be re-verified with the provider.
