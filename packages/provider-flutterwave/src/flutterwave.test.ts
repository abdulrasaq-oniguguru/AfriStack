import { createHmac } from "node:crypto";
import type { HttpRequest, HttpTransport } from "@africa-dev/payments-core";
import { describe, expect, it, vi } from "vitest";
import { FlutterwavePaymentProvider } from "./index.js";

const response = (body: unknown, status = 200) => ({ status, headers: new Headers(), body });

describe("Flutterwave adapter", () => {
  it("creates hosted payments using exact major-unit strings", async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      response({
        status: "success",
        message: "Hosted Link",
        data: { link: "https://checkout.flutterwave.com/pay/example" }
      })
    );
    const provider = new FlutterwavePaymentProvider({
      secretKey: "FLWSECK_TEST-secret",
      webhookSecret: "hook",
      transport
    });
    const payment = await provider.createPayment({
      amountMinor: "500001",
      currency: "NGN",
      customer: { email: "buyer@example.com" },
      reference: "ORDER-1",
      idempotencyKey: "idem-1",
      callbackUrl: "https://merchant.example/callback"
    });
    const request = transport.mock.calls[0]?.[0] as HttpRequest;
    expect(JSON.parse(request.body ?? "{}")).toMatchObject({
      amount: "5000.01",
      tx_ref: "ORDER-1"
    });
    expect(payment.provider).toBe("flutterwave");
  });

  it("verifies by merchant reference and normalizes major units", async () => {
    const transport = vi.fn<HttpTransport>(async () =>
      response({
        status: "success",
        message: "ok",
        data: {
          id: 88,
          tx_ref: "ORDER-1",
          flw_ref: "FLW-1",
          amount: 5000.01,
          currency: "NGN",
          status: "successful",
          payment_type: "card",
          created_at: "2026-01-01T00:00:00.000Z",
          customer: { email: "buyer@example.com" }
        }
      })
    );
    const provider = new FlutterwavePaymentProvider({
      secretKey: "secret",
      webhookSecret: "hook",
      transport
    });
    const payment = await provider.verifyPayment({ reference: "ORDER-1" });
    expect(transport.mock.calls[0]?.[0].url).toContain("verify_by_reference?tx_ref=ORDER-1");
    expect(payment).toMatchObject({ amountMinor: "500001", status: "succeeded" });
  });

  it("verifies current base64 HMAC-SHA256 webhooks and uses provider event IDs", () => {
    const webhookSecret = "hook-secret";
    const provider = new FlutterwavePaymentProvider({ secretKey: "secret", webhookSecret });
    const rawBody = new TextEncoder().encode(
      JSON.stringify({
        id: "wbk_123",
        timestamp: 1798761600000,
        type: "charge.completed",
        data: {
          amount: 2500,
          created_datetime: 1798761500,
          currency: "NGN",
          customer: { email: "buyer@example.com", name: null, phone: null },
          id: "chg_123",
          meta: {},
          payment_method: { type: "card" },
          reference: "ORDER-1",
          status: "succeeded"
        }
      })
    );
    const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("base64");
    const event = provider.parseWebhook({
      rawBody,
      headers: { "flutterwave-signature": signature }
    });
    expect(event).toMatchObject({
      type: "payment.succeeded",
      providerEventId: "wbk_123",
      data: { payment: { amountMinor: "250000" } }
    });
  });

  it("rejects a signature made over reserialized bytes", () => {
    const provider = new FlutterwavePaymentProvider({ secretKey: "secret", webhookSecret: "hook" });
    expect(() =>
      provider.verifyWebhook({
        rawBody: new TextEncoder().encode('{ "id": 1 }'),
        headers: { "flutterwave-signature": "invalid" }
      })
    ).toThrow(/signature/);
  });

  it("requires a callback URL instead of redirecting customers to a placeholder", async () => {
    const transport = vi.fn<HttpTransport>();
    const provider = new FlutterwavePaymentProvider({
      secretKey: "secret",
      webhookSecret: "hook",
      transport
    });
    await expect(
      provider.createPayment({
        amountMinor: "500001",
        currency: "NGN",
        customer: { email: "buyer@example.com" },
        reference: "ORDER-1",
        idempotencyKey: "idem-1"
      })
    ).rejects.toMatchObject({ code: "CALLBACK_URL_REQUIRED" });
    expect(transport).not.toHaveBeenCalled();
  });
});
