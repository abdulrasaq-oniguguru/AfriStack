import { createHmac } from "node:crypto";
import type { MessagingProvider } from "@africa-dev/messaging-core";
import { MockPaymentProvider } from "@africa-dev/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildGateway } from "./app.js";
import { MemoryGatewayRepository } from "./repository.js";

const apiKey = "afd_test_local_development_key_change_me";
let repository: MemoryGatewayRepository;
let provider: MockPaymentProvider;
let app: Awaited<ReturnType<typeof buildGateway>>;

const messagingProvider: MessagingProvider = {
  metadata: {
    id: "test-messaging",
    name: "Test messaging",
    category: "messaging",
    countries: ["NG"],
    capabilities: ["messaging.sendSms"],
    environments: ["test"],
    documentationUrl: "https://example.test/messaging",
    verifiedAt: "2026-10-04"
  },
  async sendSms(input) {
    return {
      id: `message-${input.idempotencyKey}`,
      provider: "test-messaging",
      channel: "sms",
      recipient: input.recipient,
      status: "sent"
    };
  }
};

beforeEach(async () => {
  repository = new MemoryGatewayRepository();
  repository.seedProject("test", apiKey);
  provider = new MockPaymentProvider();
  app = await buildGateway({
    repository,
    providers: [provider],
    messagingProviders: [messagingProvider]
  });
});
afterEach(async () => app.close());

const paymentBody = {
  amountMinor: "500000",
  currency: "NGN",
  customer: { email: "buyer@example.com" },
  reference: "ORDER-123"
};
const headers = {
  "x-api-key": apiKey,
  "idempotency-key": "idem-ORDER-123",
  "content-type": "application/json"
};

class SlowMockPaymentProvider extends MockPaymentProvider {
  createCalls = 0;
  override async createPayment(input: Parameters<MockPaymentProvider["createPayment"]>[0]) {
    this.createCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return super.createPayment(input);
  }
}

describe("gateway", () => {
  it("reports health without authentication and protects v1 APIs", async () => {
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/countries" })).statusCode).toBe(401);
  });

  it("creates a mock payment and replays the stored idempotent response", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/v1/payments",
      headers,
      payload: paymentBody
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/payments",
      headers,
      payload: paymentBody
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
  });

  it("rejects reuse of an idempotency key with different input", async () => {
    await app.inject({ method: "POST", url: "/v1/payments", headers, payload: paymentBody });
    const conflict = await app.inject({
      method: "POST",
      url: "/v1/payments",
      headers,
      payload: { ...paymentBody, amountMinor: "600000" }
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json<{ error: { code: string } }>().error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("frees an idempotency key after a definitive provider rejection", async () => {
    provider.setScenario("payment_declined");
    expect(
      (await app.inject({ method: "POST", url: "/v1/payments", headers, payload: paymentBody }))
        .statusCode
    ).toBe(422);
    provider.setScenario("payment_succeeded");
    expect(
      (await app.inject({ method: "POST", url: "/v1/payments", headers, payload: paymentBody }))
        .statusCode
    ).toBe(201);
  });

  it("keeps an idempotency key locked after an ambiguous provider timeout", async () => {
    provider.setScenario("timeout");
    expect(
      (await app.inject({ method: "POST", url: "/v1/payments", headers, payload: paymentBody }))
        .statusCode
    ).toBe(503);
    provider.setScenario("payment_succeeded");
    const retried = await app.inject({
      method: "POST",
      url: "/v1/payments",
      headers,
      payload: paymentBody
    });
    expect(retried.statusCode).toBe(409);
    expect(retried.json<{ error: { code: string } }>().error.code).toBe("IDEMPOTENCY_IN_PROGRESS");
  });

  it("executes one financial mutation for 20 concurrent identical idempotency requests", async () => {
    const slowProvider = new SlowMockPaymentProvider();
    const concurrentApp = await buildGateway({ repository, providers: [slowProvider] });
    try {
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          concurrentApp.inject({
            method: "POST",
            url: "/v1/payments",
            headers,
            payload: paymentBody
          })
        )
      );
      expect(slowProvider.createCalls).toBe(1);
      expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
      expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(19);

      const replay = await concurrentApp.inject({
        method: "POST",
        url: "/v1/payments",
        headers,
        payload: paymentBody
      });
      expect(replay.statusCode).toBe(201);
    } finally {
      await concurrentApp.close();
    }
  });

  it("durably identifies duplicate normalized webhooks", async () => {
    await app.inject({ method: "POST", url: "/v1/payments", headers, payload: paymentBody });
    const raw = JSON.stringify({ reference: "ORDER-123", status: "succeeded", eventId: "event-1" });
    const signature = createHmac("sha256", "africa-dev-local-mock").update(raw).digest("hex");
    const webhookHeaders = {
      "content-type": "application/json",
      "x-africa-mock-signature": signature
    };
    const first = await app.inject({
      method: "POST",
      url: "/v1/webhooks/mock",
      headers: webhookHeaders,
      payload: raw
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/webhooks/mock",
      headers: webhookHeaders,
      payload: raw
    });
    expect(first.json<{ duplicate: boolean }>().duplicate).toBe(false);
    expect(duplicate.json<{ duplicate: boolean }>().duplicate).toBe(true);
  });

  it("accepts exactly one of 20 concurrent duplicate webhook deliveries", async () => {
    await app.inject({ method: "POST", url: "/v1/payments", headers, payload: paymentBody });
    const raw = JSON.stringify({
      reference: "ORDER-123",
      status: "succeeded",
      eventId: "event-race"
    });
    const signature = createHmac("sha256", "africa-dev-local-mock").update(raw).digest("hex");
    const deliveries = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({
          method: "POST",
          url: "/v1/webhooks/mock",
          headers: { "content-type": "application/json", "x-africa-mock-signature": signature },
          payload: raw
        })
      )
    );
    const bodies = deliveries.map((response) => response.json<{ duplicate: boolean }>());
    expect(bodies.filter((body) => !body.duplicate)).toHaveLength(1);
    expect(bodies.filter((body) => body.duplicate)).toHaveLength(19);
  });

  it("never exposes API key hashes during rotation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      payload: { environment: "test" }
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ key: string }>().key).toMatch(/^afd_test_/);
    expect(response.body).not.toContain("scrypt:");
  });

  it("sends a message and replays the idempotent canonical response", async () => {
    const messageHeaders = {
      "x-api-key": apiKey,
      "idempotency-key": "idem-message-1",
      "content-type": "application/json"
    };
    const payload = {
      recipient: "+2348012345678",
      senderId: "Africa",
      message: "Your order is ready"
    };
    const first = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: messageHeaders,
      payload
    });
    const replay = await app.inject({
      method: "POST",
      url: "/v1/messages",
      headers: messageHeaders,
      payload
    });
    expect(first.statusCode).toBe(201);
    expect(first.json<{ status: string }>().status).toBe("sent");
    expect(replay.json()).toEqual(first.json());
  });
});
