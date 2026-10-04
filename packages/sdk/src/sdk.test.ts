import { MockPaymentProvider } from "@africa-dev/testkit";
import { describe, expect, it } from "vitest";
import { Africa } from "./index.js";

const request = {
  amountMinor: "5000",
  currency: "NGN" as const,
  customer: { email: "buyer@example.com" },
  reference: "ORDER-1",
  idempotencyKey: "idem-1"
};

describe("Africa SDK", () => {
  it("runs a complete mock purchase without credentials", async () => {
    const africa = new Africa({
      country: "NG",
      payments: { providers: [new MockPaymentProvider()], strategy: "priority" }
    });
    expect(await africa.payments.create(request)).toMatchObject({
      provider: "mock",
      status: "succeeded",
      amountMinor: "5000"
    });
  });

  it("does not automatically fail over a financial mutation", async () => {
    const unavailable = new MockPaymentProvider();
    unavailable.setScenario("provider_unavailable");
    const africa = new Africa({
      country: "NG",
      payments: { providers: [unavailable, new MockPaymentProvider()], strategy: "priority" }
    });
    await expect(africa.payments.create(request)).rejects.toMatchObject({
      name: "ProviderUnavailableError"
    });
  });
});
