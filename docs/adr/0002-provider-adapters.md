# ADR 0002: Provider-owned interpretation

Status: accepted — 2026-10-04

Generic services depend only on capability contracts. Every adapter owns provider authentication, request and response schemas, status/error mapping, and webhook verification. Provider-specific fields may be exposed as opt-in `raw` data but cannot be required by normal application logic.
