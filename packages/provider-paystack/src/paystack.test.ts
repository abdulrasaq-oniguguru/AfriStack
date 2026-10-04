import { createHmac } from "node:crypto";
import type { HttpRequest, HttpTransport } from "@africa-dev/payments-core";
import { describe, expect, it, vi } from "vitest";
import { PaystackPaymentProvider } from "./index.js";

const response = (body: unknown, status = 200) => ({ status, headers: new Headers(), body });

describe("Paystack adapter", () => {
  it("initializes with integer subunits and secret authentication", async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      response({
        status: true,
        message: "ok",
        data: {
          authorization_url: "https://checkout.paystack.com/a",
          access_code: "abc",
          reference: "ORDER-1"
        }
      })
    );
    const provider = new PaystackPaymentProvider({ secretKey: "sk_test_secret", transport });
    const payment = await provider.createPayment({
      amountMinor: "500001",
      currency: "NGN",
      customer: { email: "buyer@example.com" },
      reference: "ORDER-1",
      idempotencyKey: "idem-1"
    });
    const request = transport.mock.calls[0]?.[0] as HttpRequest;
    expect(JSON.parse(request.body ?? "{}")).toMatchObject({
      amount: "500001",
      reference: "ORDER-1"
    });
    expect(request.headers["Authorization"]).toBe("Bearer sk_test_secret");
    expect(payment.status).toBe("pending");
    // The access code is not a transaction ID; refunds must fall back to the reference.
    expect(payment.providerReference).toBeUndefined();
  });

  it("normalizes a verified transaction", async () => {
    const transport: HttpTransport = async () =>
      response({
        status: true,
        message: "ok",
        data: {
          id: 42,
          reference: "ORDER-1",
          status: "success",
          amount: 500001,
          currency: "NGN",
          channel: "card",
          created_at: "2026-01-01T00:00:00.000Z",
          paid_at: "2026-01-01T00:01:00.000Z",
          customer: { email: "buyer@example.com" }
        }
      });
    const provider = new PaystackPaymentProvider({ secretKey: "secret", transport });
    const payment = await provider.verifyPayment({ reference: "ORDER-1" });
    expect(payment).toMatchObject({
      provider: "paystack",
      amountMinor: "500001",
      status: "succeeded",
      paymentMethod: "card"
    });
  });

  it("verifies HMAC-SHA512 over untouched bytes and normalizes the event", () => {
    const secret = "webhook-secret";
    const provider = new PaystackPaymentProvider({ secretKey: secret });
    const rawBody = new TextEncoder().encode(
      JSON.stringify({
        event: "charge.success",
        data: {
          id: 42,
          reference: "ORDER-1",
          status: "success",
          amount: 500001,
          currency: "NGN",
          created_at: "2026-01-01T00:00:00.000Z",
          customer: { email: "buyer@example.com" }
        }
      })
    );
    const signature = createHmac("sha512", secret).update(rawBody).digest("hex");
    expect(
      provider.parseWebhook({ rawBody, headers: { "x-paystack-signature": signature } }).type
    ).toBe("payment.succeeded");
  });

  it("maps authentication failures", async () => {
    const transport: HttpTransport = async () =>
      response({ status: false, message: "Invalid key", code: "invalid_key" }, 401);
    const provider = new PaystackPaymentProvider({ secretKey: "secret", transport });
    await expect(provider.verifyPayment({ reference: "ORDER-1" })).rejects.toMatchObject({
      name: "AuthenticationError",
      provider: "paystack",
      retryable: false
    });
  });
});
