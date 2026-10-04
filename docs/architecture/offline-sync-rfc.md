# RFC: offline mutation infrastructure

Status: future; not part of payment v0.1.

An eventual `@africa-dev/offline` may provide a durable local mutation queue, connectivity awareness, bounded retries, idempotency, conflict resolution, and background synchronization. Payment intent creation may be queued, but an offline client must never report an online payment as successful without provider confirmation. Financial queue records need immutable request fingerprints and an explicit `unknown` reconciliation state after ambiguous delivery.
