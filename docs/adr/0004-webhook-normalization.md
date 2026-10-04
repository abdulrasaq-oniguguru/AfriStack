# ADR 0004: Raw-byte verification and durable deduplication

Status: accepted — 2026-10-04

The gateway captures the original bytes, verifies them before processing, then parses and normalizes. Canonical event IDs are deterministic, while a database unique key on provider and provider event ID is authoritative. Acknowledge only after durable receipt, then process asynchronously.

Paystack signs with hex HMAC-SHA512. AfriStack's Flutterwave adapter deliberately uses the coherent v3 integration: the configured dashboard secret hash is compared in constant time with the `verif-hash` header. v4 `flutterwave-signature` HMAC payloads are rejected until a complete, separately certified v4 migration.
