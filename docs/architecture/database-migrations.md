# Database migrations

The gateway uses ordered, versioned PostgreSQL migrations. At startup it takes a
transaction-scoped PostgreSQL advisory lock, creates the `schema_migrations`
ledger if necessary, then applies every unapplied migration in order. The
pending migration sequence and its ledger records are committed in the same
database transaction, so a failed migration is not marked as applied.

The first two migrations establish the original gateway schema and add
project-scoped webhook event storage. Their DDL is idempotent so an existing
deployment created by the pre-migration startup schema can be adopted safely:
on its first upgraded startup, the ledger is populated after the schema is
confirmed/upgraded.

## Operator policy

- Back up production PostgreSQL before deploying a gateway version containing a
  new migration.
- Multiple gateway instances may start concurrently. One holds the advisory
  migration lock while the others wait, then observe the completed ledger.
- Migrations are forward-only. The service does not automatically roll back a
  schema change; roll back application code only when it remains compatible with
  the migrated schema, or restore a verified backup.
- Never delete or edit an already-released migration. Add a new migration for
  every schema change.

Webhook events stored before migration `0002_webhook_events_project_scope` have
no safely attributable project ID. They are preserved, but deliberately remain
hidden from project-scoped `GET /v1/events` responses.

The Compose mock flow exercises startup against both a clean volume in CI and a
locally preserved volume during release verification. A dedicated upgraded-
database CI fixture remains a future hardening improvement.
