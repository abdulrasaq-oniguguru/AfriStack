import { randomUUID } from "node:crypto";
import type { CanonicalPaymentEvent, Payment } from "@africa-dev/payments-core";
import type { Message } from "@africa-dev/messaging-core";
import { apiKeyPrefix, hashApiKey, verifyApiKey } from "./api-keys.js";

export type Project = { id: string; name: string };
export type IdempotencyClaim =
  | { state: "claimed" }
  | { state: "replay"; responseStatus: number; responseBody: unknown }
  | { state: "conflict" }
  | { state: "processing" };

export interface GatewayRepository {
  ready(): Promise<boolean>;
  authenticateApiKey(key: string): Promise<Project | undefined>;
  claimIdempotency(
    projectId: string,
    key: string,
    operation: string,
    requestHash: string
  ): Promise<IdempotencyClaim>;
  completeIdempotency(
    projectId: string,
    key: string,
    responseStatus: number,
    responseBody: unknown
  ): Promise<void>;
  releaseIdempotency(projectId: string, key: string): Promise<void>;
  savePayment(projectId: string, payment: Payment): Promise<void>;
  saveMessage(projectId: string, message: Message): Promise<void>;
  getPayment(projectId: string, reference: string): Promise<Payment | undefined>;
  insertWebhookEvent(event: CanonicalPaymentEvent): Promise<boolean>;
  createApiKey(projectId: string, prefix: string, hash: string): Promise<void>;
  revokeApiKey(projectId: string, prefix: string): Promise<boolean>;
  close(): Promise<void>;
}

type MemoryKey = { projectId: string; prefix: string; hash: string; revokedAt?: string };
type MemoryIdempotency = {
  operation: string;
  requestHash: string;
  status: "processing" | "completed";
  responseStatus?: number;
  responseBody?: unknown;
};

export class MemoryGatewayRepository implements GatewayRepository {
  readonly #projects = new Map<string, Project>();
  readonly #keys: MemoryKey[] = [];
  readonly #idempotency = new Map<string, MemoryIdempotency>();
  readonly #payments = new Map<string, Payment>();
  readonly #messages = new Map<string, Message>();
  readonly #webhooks = new Set<string>();

  seedProject(name: string, apiKey: string): Project {
    const project = { id: randomUUID(), name };
    this.#projects.set(project.id, project);
    this.#keys.push({
      projectId: project.id,
      prefix: apiKeyPrefix(apiKey),
      hash: hashApiKey(apiKey)
    });
    return project;
  }

  async ready(): Promise<boolean> {
    return true;
  }

  async authenticateApiKey(key: string): Promise<Project | undefined> {
    let prefix: string;
    try {
      prefix = apiKeyPrefix(key);
    } catch {
      return undefined;
    }
    const match = this.#keys.find(
      (candidate) =>
        candidate.prefix === prefix && !candidate.revokedAt && verifyApiKey(key, candidate.hash)
    );
    return match ? this.#projects.get(match.projectId) : undefined;
  }

  async claimIdempotency(
    projectId: string,
    key: string,
    operation: string,
    requestHash: string
  ): Promise<IdempotencyClaim> {
    const storageKey = `${projectId}:${key}`;
    const existing = this.#idempotency.get(storageKey);
    if (!existing) {
      this.#idempotency.set(storageKey, { operation, requestHash, status: "processing" });
      return { state: "claimed" };
    }
    if (existing.operation !== operation || existing.requestHash !== requestHash)
      return { state: "conflict" };
    if (existing.status === "processing") return { state: "processing" };
    return {
      state: "replay",
      responseStatus: existing.responseStatus ?? 200,
      responseBody: existing.responseBody
    };
  }

  async completeIdempotency(
    projectId: string,
    key: string,
    responseStatus: number,
    responseBody: unknown
  ): Promise<void> {
    const record = this.#idempotency.get(`${projectId}:${key}`);
    if (!record) throw new Error("Idempotency claim does not exist");
    record.status = "completed";
    record.responseStatus = responseStatus;
    record.responseBody = responseBody;
  }
  async releaseIdempotency(projectId: string, key: string): Promise<void> {
    const storageKey = `${projectId}:${key}`;
    if (this.#idempotency.get(storageKey)?.status === "processing")
      this.#idempotency.delete(storageKey);
  }

  async savePayment(projectId: string, payment: Payment): Promise<void> {
    this.#payments.set(`${projectId}:${payment.reference}`, structuredClone(payment));
  }
  async getPayment(projectId: string, reference: string): Promise<Payment | undefined> {
    return this.#payments.get(`${projectId}:${reference}`);
  }
  async saveMessage(projectId: string, message: Message): Promise<void> {
    this.#messages.set(`${projectId}:${message.id}`, structuredClone(message));
  }
  async insertWebhookEvent(event: CanonicalPaymentEvent): Promise<boolean> {
    const key = `${event.provider}:${event.providerEventId}`;
    if (this.#webhooks.has(key)) return false;
    this.#webhooks.add(key);
    return true;
  }
  async createApiKey(projectId: string, prefix: string, hash: string): Promise<void> {
    this.#keys.push({ projectId, prefix, hash });
  }
  async revokeApiKey(projectId: string, prefix: string): Promise<boolean> {
    const key = this.#keys.find(
      (candidate) =>
        candidate.projectId === projectId && candidate.prefix === prefix && !candidate.revokedAt
    );
    if (!key) return false;
    key.revokedAt = new Date().toISOString();
    return true;
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}
