import { createHash, randomUUID } from "node:crypto";
import type { Message } from "@africa-dev/messaging-core";
import type { CanonicalPaymentEvent, Payment } from "@africa-dev/payments-core";
import postgres, { type Sql } from "postgres";
import { apiKeyPrefix, hashApiKey, verifyApiKey } from "./api-keys.js";
import {
  canAdvancePayment,
  type GatewayRepository,
  type IdempotencyClaim,
  type Project,
  type StoredWebhookEvent
} from "./repository.js";

export class PostgresGatewayRepository implements GatewayRepository {
  readonly #sql: Sql;
  constructor(databaseUrl: string) {
    this.#sql = postgres(databaseUrl, { max: 10, idle_timeout: 20 });
  }

  async migrate(): Promise<void> {
    await this.#sql`
      create table if not exists schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )`;
    const applied = new Set(
      (await this.#sql<{ id: string }[]>`select id from schema_migrations`).map(
        (migration) => migration.id
      )
    );
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      await this.#sql.begin(async (sql) => {
        await sql.unsafe(migration.sql);
        await sql`insert into schema_migrations (id) values (${migration.id})`;
      });
    }
  }

  async bootstrapProject(name: string, key: string): Promise<Project> {
    const prefix = apiKeyPrefix(key);
    const existing = await this.#sql<{ id: string; name: string }[]>`
      select p.id, p.name from projects p join project_api_keys k on k.project_id = p.id where k.prefix = ${prefix} limit 1`;
    if (existing[0]) return existing[0];
    const project = { id: randomUUID(), name };
    await this.#sql.begin(async (sql) => {
      await sql`insert into projects (id, name) values (${project.id}, ${project.name})`;
      await sql`insert into project_api_keys (id, project_id, prefix, key_hash) values (${randomUUID()}, ${project.id}, ${prefix}, ${hashApiKey(key)})`;
    });
    return project;
  }

  async ready(): Promise<boolean> {
    try {
      await this.#sql`select 1`;
      return true;
    } catch {
      return false;
    }
  }

  async authenticateApiKey(key: string): Promise<Project | undefined> {
    let prefix: string;
    try {
      prefix = apiKeyPrefix(key);
    } catch {
      return undefined;
    }
    const rows = await this.#sql<
      { project_id: string; name: string; key_hash: string; prefix: string }[]
    >`
      select k.project_id, p.name, k.key_hash, k.prefix from project_api_keys k join projects p on p.id = k.project_id
      where k.prefix = ${prefix} and k.revoked_at is null`;
    const row = rows.find((candidate) => verifyApiKey(key, candidate.key_hash));
    if (!row) return undefined;
    await this
      .#sql`update project_api_keys set last_used_at = now() where project_id = ${row.project_id} and prefix = ${prefix}`;
    return {
      id: row.project_id,
      name: row.name,
      keyEnvironment: row.prefix.startsWith("afd_live_") ? "live" : "test"
    };
  }

  async claimIdempotency(
    projectId: string,
    key: string,
    operation: string,
    requestHash: string
  ): Promise<IdempotencyClaim> {
    const inserted = await this.#sql<{ key: string }[]>`
      insert into idempotency_keys (project_id, key, operation, request_hash, status)
      values (${projectId}, ${key}, ${operation}, ${requestHash}, 'processing')
      on conflict (project_id, key) do nothing returning key`;
    if (inserted[0]) return { state: "claimed" };
    const [existing] = await this.#sql<
      {
        operation: string;
        request_hash: string;
        status: string;
        response_status: number | null;
        response_body: unknown;
      }[]
    >`
      select operation, request_hash, status, response_status, response_body from idempotency_keys where project_id = ${projectId} and key = ${key}`;
    if (existing?.operation !== operation || existing.request_hash !== requestHash)
      return { state: "conflict" };
    if (existing.status !== "completed") return { state: "processing" };
    return {
      state: "replay",
      responseStatus: existing.response_status ?? 200,
      responseBody: existing.response_body
    };
  }

  async completeIdempotency(
    projectId: string,
    key: string,
    responseStatus: number,
    responseBody: unknown
  ): Promise<void> {
    await this
      .#sql`update idempotency_keys set status = 'completed', response_status = ${responseStatus}, response_body = ${this.#sql.json(responseBody as never)}, completed_at = now() where project_id = ${projectId} and key = ${key}`;
  }

  async releaseIdempotency(projectId: string, key: string): Promise<void> {
    await this
      .#sql`delete from idempotency_keys where project_id = ${projectId} and key = ${key} and status = 'processing'`;
  }

  async savePayment(projectId: string, payment: Payment): Promise<void> {
    await this
      .#sql`insert into payments (id, project_id, provider, reference, provider_reference, amount_minor, currency, status, normalized_data)
      values (${payment.id}, ${projectId}, ${payment.provider}, ${payment.reference}, ${payment.providerReference ?? null}, ${payment.amountMinor}, ${payment.currency}, ${payment.status}, ${this.#sql.json(payment as never)})
      on conflict (project_id, reference) do update set provider_reference = excluded.provider_reference, status = excluded.status, normalized_data = excluded.normalized_data, updated_at = now()`;
  }

  async getPayment(projectId: string, reference: string): Promise<Payment | undefined> {
    const [row] = await this.#sql<
      { normalized_data: Payment }[]
    >`select normalized_data from payments where project_id = ${projectId} and reference = ${reference}`;
    return row?.normalized_data;
  }

  async saveMessage(projectId: string, message: Message): Promise<void> {
    const recipientHash = createHash("sha256").update(message.recipient).digest("hex");
    await this
      .#sql`insert into messages (id, project_id, provider, recipient_hash, status, normalized_data)
      values (${message.id}, ${projectId}, ${message.provider}, ${recipientHash}, ${message.status}, ${this.#sql.json(message as never)})
      on conflict (id) do update set status = excluded.status, normalized_data = excluded.normalized_data`;
  }

  async recordWebhookEvent(
    event: CanonicalPaymentEvent
  ): Promise<{ inserted: boolean; processed: boolean; projectId?: string }> {
    return this.#sql.begin(async (sql) => {
      const payments = await sql<
        { project_id: string; normalized_data: Payment }[]
      >`select project_id, normalized_data from payments
        where provider = ${event.provider} and reference = ${event.data.payment.reference}
        limit 2 for update`;
      const payment = payments.length === 1 ? payments[0] : undefined;
      const projectId = payment?.project_id;
      const matchesPayment =
        payment?.normalized_data.amountMinor === event.data.payment.amountMinor &&
        payment.normalized_data.currency === event.data.payment.currency;
      const canProcess = Boolean(
        payment &&
        matchesPayment &&
        canAdvancePayment(payment.normalized_data.status, event.data.payment.status)
      );
      const inserted = await sql<{ id: string }[]>`
        insert into webhook_events (id, project_id, provider, provider_event_id, event_type, normalized_data, status)
        values (${event.id}, ${projectId ?? null}, ${event.provider}, ${event.providerEventId}, ${event.type}, ${sql.json(event as never)}, ${canProcess ? "processed" : "ignored"})
        on conflict (provider, provider_event_id) do nothing returning id`;
      const processed = Boolean(inserted[0] && canProcess);
      if (processed && payment) {
        await sql`update payments set provider_reference = ${event.data.payment.providerReference ?? null},
          status = ${event.data.payment.status}, normalized_data = ${sql.json(event.data.payment as never)}, updated_at = now()
          where project_id = ${payment.project_id} and reference = ${event.data.payment.reference}`;
      }
      return {
        inserted: Boolean(inserted[0]),
        processed,
        ...(projectId ? { projectId } : {})
      };
    });
  }

  async listWebhookEvents(
    projectId: string,
    cursor?: string,
    limit = 50
  ): Promise<{ data: StoredWebhookEvent[]; nextCursor?: string }> {
    const rows = await this.#sql<
      {
        id: string;
        normalized_data: CanonicalPaymentEvent;
        received_at: string;
        status: "processed" | "ignored";
      }[]
    >`select id, normalized_data, received_at, status from webhook_events
      where project_id = ${projectId}
        and (${cursor ?? null}::text is null or (received_at, id) < (
          select received_at, id from webhook_events where id = ${cursor ?? null} and project_id = ${projectId}
        ))
      order by received_at desc, id desc limit ${limit + 1}`;
    const page = rows.slice(0, limit).map((row) => ({
      ...row.normalized_data,
      receivedAt: new Date(row.received_at).toISOString(),
      processingStatus: row.status
    }));
    const last = page.at(-1);
    return {
      data: page,
      ...(rows.length > limit && last ? { nextCursor: last.id } : {})
    };
  }

  async createApiKey(projectId: string, prefix: string, hash: string): Promise<void> {
    await this
      .#sql`insert into project_api_keys (id, project_id, prefix, key_hash) values (${randomUUID()}, ${projectId}, ${prefix}, ${hash})`;
  }
  async revokeApiKey(projectId: string, prefix: string): Promise<boolean> {
    const rows = await this.#sql<
      { prefix: string }[]
    >`update project_api_keys set revoked_at = now() where project_id = ${projectId} and prefix = ${prefix} and revoked_at is null returning prefix`;
    return Boolean(rows[0]);
  }
  async close(): Promise<void> {
    await this.#sql.end();
  }
}

const MIGRATIONS = [
  {
    id: "0001_initial",
    sql: `
create table if not exists projects (id uuid primary key, name text not null, created_at timestamptz not null default now());
create table if not exists project_api_keys (id uuid primary key, project_id uuid not null references projects(id), prefix text not null, key_hash text not null, created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz);
create index if not exists project_api_keys_prefix_idx on project_api_keys(prefix) where revoked_at is null;
create table if not exists provider_connections (id uuid primary key, project_id uuid not null references projects(id), provider text not null, environment text not null, secret_reference text not null, created_at timestamptz not null default now(), unique(project_id, provider, environment));
create table if not exists payments (id text primary key, project_id uuid not null references projects(id), provider text not null, reference text not null, provider_reference text, amount_minor numeric(78,0) not null, currency char(3) not null, status text not null, normalized_data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id, reference));
create table if not exists refunds (id text primary key, project_id uuid not null references projects(id), payment_id text not null references payments(id), provider text not null, amount_minor numeric(78,0) not null, currency char(3) not null, status text not null, normalized_data jsonb not null, created_at timestamptz not null default now());
create table if not exists webhook_events (id text primary key, provider text not null, provider_event_id text not null, event_type text not null, normalized_data jsonb not null, status text not null, received_at timestamptz not null default now(), processed_at timestamptz, unique(provider, provider_event_id));
create table if not exists webhook_attempts (id uuid primary key, webhook_event_id text not null references webhook_events(id), attempt integer not null, status text not null, error_code text, created_at timestamptz not null default now());
create table if not exists messages (id text primary key, project_id uuid not null references projects(id), provider text not null, recipient_hash text not null, status text not null, normalized_data jsonb not null, created_at timestamptz not null default now());
create table if not exists idempotency_keys (project_id uuid not null references projects(id), key text not null, operation text not null, request_hash text not null, status text not null, response_status integer, response_body jsonb, created_at timestamptz not null default now(), completed_at timestamptz, primary key(project_id, key));
create table if not exists audit_events (id uuid primary key, project_id uuid not null references projects(id), action text not null, actor_key_prefix text, target_type text, target_id text, metadata jsonb not null default '{}', created_at timestamptz not null default now());
`
  },
  {
    id: "0002_webhook_events_project_scope",
    sql: `
alter table webhook_events add column if not exists project_id uuid references projects(id);
create index if not exists webhook_events_project_received_idx on webhook_events(project_id, received_at desc, id desc);
`
  }
] as const;
