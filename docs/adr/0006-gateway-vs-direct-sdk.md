# ADR 0006: Direct SDK and self-hosted gateway

Status: accepted — 2026-10-04

Direct mode minimizes infrastructure for one backend and talks to configured providers directly. Gateway mode centralizes credentials, durable idempotency, webhook receipt, audit data, and multiple applications. Both use the same provider contracts. Financial mutations are never automatically replayed to a fallback provider after dispatch.
