import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "./index.js";

const input = {
  amountMinor: "500000",
  currency: "NGN" as const,
  customer: { email: "customer@example.com" },
  reference: "ORDER-123",
  idempotencyKey: "idem-ORDER-123"
};

describe("mock payment provider", () => {
  it("completes a local payment end to end", async () => {
    const provider = new MockPaymentProvider();
    const created = await provider.createPayment(input);
    expect(created.status).toBe("succeeded");
    expect(await provider.verifyPayment({ reference: input.reference })).toEqual(created);
  });

  it("deduplicates create calls by idempotency key", async () => {
    const provider = new MockPaymentProvider();
    const first = await provider.createPayment(input);
    const second = await provider.createPayment({ ...input, reference: "OTHER" });
    expect(second.id).toBe(first.id);
  });

  it("verifies and normalizes signed webhooks", async () => {
    const provider = new MockPaymentProvider();
    await provider.createPayment(input);
    const rawBody = new TextEncoder().encode(
      JSON.stringify({ reference: input.reference, status: "succeeded" })
    );
    const event = provider.parseWebhook({
      rawBody,
      headers: { "x-africa-mock-signature": provider.signWebhook(rawBody) }
    });
    expect(event.type).toBe("payment.succeeded");
  });

  it("rejects invalid signatures", () => {
    const provider = new MockPaymentProvider();
    expect(() => provider.verifyWebhook({ rawBody: new Uint8Array(), headers: {} })).toThrow(
      /signature/
    );
  });
});
