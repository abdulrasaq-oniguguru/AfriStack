import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  PaymentDeclinedError,
  ProviderUnavailableError,
  WebhookVerificationError
} from "@africa-dev/core";
import type {
  CanonicalPaymentEvent,
  CreatePaymentInput,
  GetPaymentInput,
  Payment,
  PaymentProvider,
  PaymentStatus,
  Refund,
  RefundPaymentInput,
  VerifyPaymentInput,
  WebhookInput
} from "@africa-dev/payments-core";

export type MockScenario =
  | "payment_succeeded"
  | "payment_failed"
  | "payment_pending"
  | "payment_declined"
  | "timeout"
  | "provider_unavailable";

const metadata = {
  id: "mock",
  name: "Local Mock Provider",
  category: "payments" as const,
  countries: ["NG"],
  capabilities: [
    "payment.create",
    "payment.verify",
    "payment.get",
    "payment.refund",
    "webhook.verify"
  ],
  environments: ["test" as const],
  documentationUrl:
    "https://github.com/africa-dev-infra/africa-dev-infra/tree/main/packages/testkit",
  verifiedAt: "2026-10-04"
};

const scenarioStatus: Partial<Record<MockScenario, PaymentStatus>> = {
  payment_succeeded: "succeeded",
  payment_failed: "failed",
  payment_pending: "pending"
};

export class MockPaymentProvider implements PaymentProvider {
  readonly metadata = metadata;
  readonly #payments = new Map<string, Payment>();
  readonly #idempotency = new Map<string, string>();
  #scenario: MockScenario = "payment_succeeded";

  setScenario(scenario: MockScenario): void {
    this.#scenario = scenario;
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    this.#throwScenarioError();
    const existingReference = this.#idempotency.get(input.idempotencyKey);
    if (existingReference) return this.#requiredPayment(existingReference);
    const now = new Date().toISOString();
    const payment: Payment = {
      id: `mock_${randomUUID()}`,
      provider: "mock",
      reference: input.reference,
      providerReference: `mock-provider-${input.reference}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: scenarioStatus[this.#scenario] ?? "pending",
      customer: input.customer,
      checkoutUrl: `http://localhost:4010/mock-checkout/${encodeURIComponent(input.reference)}`,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now
    };
    this.#payments.set(payment.reference, payment);
    this.#idempotency.set(input.idempotencyKey, payment.reference);
    return payment;
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<Payment> {
    this.#throwScenarioError();
    return this.#requiredPayment(input.reference);
  }

  async getPayment(input: GetPaymentInput): Promise<Payment> {
    return this.verifyPayment(input);
  }

  async refundPayment(input: RefundPaymentInput): Promise<Refund> {
    const payment = this.#requiredPayment(input.reference);
    const amountMinor = input.amountMinor ?? payment.amountMinor;
    payment.status = amountMinor === payment.amountMinor ? "refunded" : "partially_refunded";
    payment.updatedAt = new Date().toISOString();
    return {
      id: `mock-refund-${randomUUID()}`,
      provider: "mock",
      paymentReference: payment.reference,
      amountMinor,
      currency: payment.currency,
      status: "succeeded",
      createdAt: payment.updatedAt
    };
  }

  verifyWebhook(input: WebhookInput): void {
    const signature = getHeader(input.headers, "x-africa-mock-signature");
    const expected = createHmac("sha256", "africa-dev-local-mock")
      .update(input.rawBody)
      .digest("hex");
    if (!signature || !safeEqual(expected, signature)) {
      throw new WebhookVerificationError("Invalid mock webhook signature", {
        provider: "mock",
        code: "INVALID_WEBHOOK_SIGNATURE"
      });
    }
  }

  parseWebhook(input: WebhookInput): CanonicalPaymentEvent {
    this.verifyWebhook(input);
    const body = JSON.parse(new TextDecoder().decode(input.rawBody)) as {
      reference: string;
      status: PaymentStatus;
      eventId?: string;
    };
    const payment = this.#requiredPayment(body.reference);
    payment.status = body.status;
    payment.updatedAt = new Date().toISOString();
    const providerEventId = body.eventId ?? `${body.reference}:${body.status}`;
    return {
      id: createHash("sha256").update(`mock:${providerEventId}`).digest("hex"),
      type: statusToEvent(body.status),
      provider: "mock",
      providerEventId,
      createdAt: payment.updatedAt,
      data: { payment }
    };
  }

  signWebhook(rawBody: Uint8Array): string {
    return createHmac("sha256", "africa-dev-local-mock").update(rawBody).digest("hex");
  }

  #requiredPayment(reference: string): Payment {
    const payment = this.#payments.get(reference);
    if (!payment) throw new Error(`Mock payment '${reference}' does not exist`);
    return payment;
  }

  #throwScenarioError(): void {
    if (this.#scenario === "payment_declined") {
      throw new PaymentDeclinedError("Payment declined by mock scenario", {
        provider: "mock",
        code: "PAYMENT_DECLINED"
      });
    }
    if (this.#scenario === "provider_unavailable") {
      throw new ProviderUnavailableError("Mock provider unavailable", {
        provider: "mock",
        retryable: true
      });
    }
    if (this.#scenario === "timeout") {
      throw new ProviderUnavailableError("Mock provider timed out", {
        provider: "mock",
        code: "TIMEOUT",
        retryable: true
      });
    }
  }
}

function getHeader(headers: WebhookInput["headers"], name: string): string | undefined {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

function statusToEvent(status: PaymentStatus): CanonicalPaymentEvent["type"] {
  if (status === "succeeded") return "payment.succeeded";
  if (status === "failed" || status === "cancelled") return "payment.failed";
  if (status === "refunded" || status === "partially_refunded") return "payment.refunded";
  if (status === "processing") return "payment.processing";
  return "payment.created";
}
