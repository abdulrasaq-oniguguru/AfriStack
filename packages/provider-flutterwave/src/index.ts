import { createHash, timingSafeEqual } from "node:crypto";
import {
  AuthenticationError,
  InvalidRequestError,
  NetworkError,
  ProviderUnavailableError,
  RateLimitError,
  WebhookVerificationError
} from "@africa-dev/core";
import {
  fetchTransport,
  majorToMinor,
  minorToMajor,
  type CanonicalPaymentEvent,
  type CreatePaymentInput,
  type GetPaymentInput,
  type HttpResponse,
  type HttpTransport,
  type Payment,
  type PaymentProvider,
  type PaymentStatus,
  type Refund,
  type RefundPaymentInput,
  type VerifyPaymentInput,
  type WebhookInput
} from "@africa-dev/payments-core";
import { z } from "zod";

const currencySchema = z.enum([
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "UGX",
  "TZS",
  "RWF",
  "XOF",
  "XAF",
  "USD"
]);
const customerSchema = z
  .object({
    email: z.string().nullish(),
    name: z.string().nullish(),
    phone_number: z.string().nullish(),
    phone: z.string().nullish()
  })
  .loose();
const transactionSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    tx_ref: z.string(),
    flw_ref: z.string().nullish(),
    amount: z.union([z.number(), z.string()]),
    currency: currencySchema,
    status: z.string(),
    payment_type: z.string().nullish(),
    processor_response: z.string().nullish(),
    created_at: z.string().nullish(),
    customer: customerSchema.optional(),
    meta: z.unknown().optional()
  })
  .loose();
const envelopeSchema = z
  .object({
    status: z.string(),
    message: z.string(),
    data: z.unknown().optional(),
    code: z.string().optional(),
    error_id: z.string().optional()
  })
  .loose();
const refundSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    amount_refunded: z.union([z.number(), z.string()]),
    status: z.string(),
    flw_ref: z.string().nullish(),
    created_at: z.string().optional()
  })
  .loose();

export type FlutterwaveProviderOptions = {
  secretKey: string;
  webhookSecret: string;
  baseUrl?: string;
  transport?: HttpTransport;
  includeRaw?: boolean;
};

export class FlutterwavePaymentProvider implements PaymentProvider {
  readonly metadata = {
    id: "flutterwave",
    name: "Flutterwave",
    category: "payments" as const,
    countries: ["NG"],
    capabilities: [
      "payment.create",
      "payment.verify",
      "payment.get",
      "payment.refund",
      "webhook.verify"
    ],
    environments: ["test" as const, "live" as const],
    documentationUrl: "https://developer.flutterwave.com/v3.0.0/docs/webhooks",
    verifiedAt: "2026-10-04"
  };
  readonly #baseUrl: string;
  readonly #transport: HttpTransport;
  readonly #includeRaw: boolean;

  constructor(private readonly options: FlutterwaveProviderOptions) {
    if (!options.secretKey)
      throw new AuthenticationError("Flutterwave secret key is required", {
        provider: "flutterwave"
      });
    if (!options.webhookSecret)
      throw new AuthenticationError("Flutterwave webhook secret is required", {
        provider: "flutterwave"
      });
    this.#baseUrl = (options.baseUrl ?? "https://api.flutterwave.com/v3").replace(/\/$/, "");
    this.#transport = options.transport ?? fetchTransport;
    this.#includeRaw = options.includeRaw ?? false;
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    if (!input.callbackUrl)
      throw new InvalidRequestError("Flutterwave hosted checkout requires a callbackUrl", {
        provider: "flutterwave",
        code: "CALLBACK_URL_REQUIRED"
      });
    const response = await this.#request("POST", "/payments", {
      tx_ref: input.reference,
      amount: minorToMajor(input.amountMinor, input.currency),
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: {
        email: input.customer.email,
        ...(input.customer.name ? { name: input.customer.name } : {}),
        ...(input.customer.phone ? { phonenumber: input.customer.phone } : {})
      },
      ...(input.metadata ? { meta: input.metadata } : {})
    });
    const data = z.object({ link: z.url() }).parse(response.data);
    const now = new Date().toISOString();
    return {
      id: input.reference,
      provider: "flutterwave",
      reference: input.reference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "pending",
      customer: input.customer,
      checkoutUrl: data.link,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      ...(this.#includeRaw ? { raw: response } : {})
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<Payment> {
    const path = input.providerReference
      ? `/transactions/${encodeURIComponent(input.providerReference)}/verify`
      : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(input.reference)}`;
    const response = await this.#request("GET", path);
    return this.#mapTransaction(response.data, response);
  }

  async getPayment(input: GetPaymentInput): Promise<Payment> {
    return this.verifyPayment(input);
  }

  async refundPayment(input: RefundPaymentInput): Promise<Refund> {
    const transactionId =
      input.providerReference ??
      (await this.verifyPayment({ reference: input.reference })).providerReference;
    if (!transactionId)
      throw new InvalidRequestError("Flutterwave transaction ID is required for refunds", {
        provider: "flutterwave",
        code: "MISSING_PROVIDER_REFERENCE"
      });
    const payment = await this.verifyPayment({
      reference: input.reference,
      providerReference: transactionId
    });
    const amountMinor = input.amountMinor ?? payment.amountMinor;
    const response = await this.#request(
      "POST",
      `/transactions/${encodeURIComponent(transactionId)}/refund`,
      {
        amount: minorToMajor(amountMinor, payment.currency),
        ...(input.reason ? { comments: input.reason } : {})
      }
    );
    const data = refundSchema.parse(response.data);
    return {
      id: String(data.id),
      provider: "flutterwave",
      paymentReference: input.reference,
      ...(data.flw_ref ? { providerReference: data.flw_ref } : {}),
      amountMinor: majorToMinor(String(data.amount_refunded), payment.currency),
      currency: payment.currency,
      status: mapRefundStatus(data.status),
      createdAt: data.created_at ?? new Date().toISOString(),
      ...(this.#includeRaw ? { raw: response } : {})
    };
  }

  verifyWebhook(input: WebhookInput): void {
    const signature = getHeader(input.headers, "verif-hash");
    if (!signature || !safeEqual(this.options.webhookSecret, signature)) {
      throw new WebhookVerificationError("Invalid Flutterwave webhook signature", {
        provider: "flutterwave",
        code: "INVALID_WEBHOOK_SIGNATURE"
      });
    }
  }

  parseWebhook(input: WebhookInput): CanonicalPaymentEvent {
    this.verifyWebhook(input);
    const value = JSON.parse(new TextDecoder().decode(input.rawBody)) as unknown;
    const webhook = legacyWebhookSchema.parse(value);
    const payment = this.#mapTransaction(webhook.data, webhook.data);
    const providerEventId = `${webhook.event}:${String(webhook.data.id)}:${webhook.data.status}`;
    return {
      id: createHash("sha256").update(`flutterwave:${providerEventId}`).digest("hex"),
      type: statusToEvent(payment.status),
      provider: "flutterwave",
      providerEventId,
      createdAt: payment.updatedAt,
      data: { payment }
    };
  }

  #mapTransaction(value: unknown, raw: unknown): Payment {
    const data = transactionSchema.parse(value);
    const createdAt = data.created_at ?? new Date().toISOString();
    return {
      id: String(data.id),
      provider: "flutterwave",
      reference: data.tx_ref,
      providerReference: String(data.id),
      amountMinor: majorToMinor(String(data.amount), data.currency),
      currency: data.currency,
      status: mapStatus(data.status),
      customer: {
        email: data.customer?.email ?? "unknown@invalid.local",
        ...(data.customer?.name ? { name: data.customer.name } : {}),
        ...(data.customer?.phone_number
          ? { phone: data.customer.phone_number }
          : data.customer?.phone
            ? { phone: data.customer.phone }
            : {})
      },
      ...(data.payment_type ? { paymentMethod: data.payment_type } : {}),
      ...(data.status === "failed" && data.processor_response
        ? { failureMessage: data.processor_response }
        : {}),
      metadata: isRecord(data.meta) ? data.meta : {},
      createdAt,
      updatedAt: createdAt,
      ...(this.#includeRaw ? { raw } : {})
    };
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>
  ): Promise<z.infer<typeof envelopeSchema>> {
    let response: HttpResponse;
    try {
      response = await this.#transport({
        method,
        url: `${this.#baseUrl}${path}`,
        headers: {
          Authorization: `Bearer ${this.options.secretKey}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (cause) {
      throw new NetworkError("Could not reach Flutterwave", {
        provider: "flutterwave",
        code: "NETWORK_ERROR",
        retryable: true,
        cause
      });
    }
    const parsed = envelopeSchema.safeParse(response.body);
    if (!parsed.success)
      throw new ProviderUnavailableError("Flutterwave returned a malformed response", {
        provider: "flutterwave",
        code: "MALFORMED_RESPONSE",
        retryable: response.status >= 500,
        cause: parsed.error
      });
    if (response.status >= 400 || parsed.data.status !== "success")
      throwFlutterwaveError(response.status, parsed.data);
    return parsed.data;
  }
}

const legacyWebhookSchema = z.object({ event: z.string(), data: transactionSchema });

function mapStatus(status: string): PaymentStatus {
  if (["successful", "succeeded"].includes(status)) return "succeeded";
  if (["failed", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (["processing", "pending"].includes(status)) return "processing";
  if (status === "refunded") return "refunded";
  return "pending";
}
function mapRefundStatus(status: string): Refund["status"] {
  if (["completed", "successful", "succeeded"].includes(status)) return "succeeded";
  if (["failed", "cancelled"].includes(status)) return "failed";
  if (status === "processing") return "processing";
  return "pending";
}
function statusToEvent(status: PaymentStatus): CanonicalPaymentEvent["type"] {
  if (status === "succeeded") return "payment.succeeded";
  if (status === "failed" || status === "cancelled") return "payment.failed";
  if (status === "refunded" || status === "partially_refunded") return "payment.refunded";
  if (status === "processing") return "payment.processing";
  return "payment.created";
}
function throwFlutterwaveError(status: number, body: z.infer<typeof envelopeSchema>): never {
  const base = {
    provider: "flutterwave",
    code: body.code ?? "FLUTTERWAVE_ERROR",
    retryable: status >= 500
  };
  if (status === 401 || status === 403) throw new AuthenticationError(body.message, base);
  if (status === 429) throw new RateLimitError(body.message, { ...base, retryable: true });
  if (status >= 500) throw new ProviderUnavailableError(body.message, base);
  throw new InvalidRequestError(body.message, base);
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
