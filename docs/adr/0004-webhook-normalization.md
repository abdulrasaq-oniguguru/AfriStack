# ADR 0004: Raw-byte verification and durable deduplication

Status: accepted — 2026-10-04

The gateway captures the original bytes, verifies them before processing, then parses and normalizes. Canonical event IDs are deterministic, while a database unique key on provider and provider event ID is authoritative. Acknowledge only after durable receipt, then process asynchronously.

Paystack signs with hex HMAC-SHA512. Flutterwave's current v4 webhook signature section specifies base64 HMAC-SHA256 in `flutterwave-signature`; examples later on the same page still show direct secret comparison. We follow the explicit signature algorithm section and document this upstream inconsistency. Legacy payload shapes may be parsed, but are not accepted with legacy direct-secret authentication.
