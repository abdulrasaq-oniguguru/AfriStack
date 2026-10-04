import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  AuthenticationError,
  InvalidRequestError,
  NetworkError,
  PaymentDeclinedError,
  ProviderUnavailableError,
  RateLimitError,
  WebhookVerificationError
} from "@africa-dev/core";
import {
  fetchTransport,
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
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    phone: z.string().nullish()
  })
  .loose();
const transactionSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    reference: z.string(),
    status: z.string(),
    amount: z.number().int().nonnegative(),
    currency: currencySchema,
    channel: z.string().nullish(),
    gateway_response: z.string().nullish(),
    created_at: z.string().nullish(),
    paid_at: z.string().nullish(),
    customer: customerSchema.optional(),
    metadata: z.unknown().optional()
  })
  .loose();
const envelopeSchema = z
  .object({
    status: z.boolean(),
    message: z.string(),
    data: z.unknown().optional(),
    code: z.string().optional(),
    type: z.string().optional()
  })
  .loose();
const refundSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    amount: z.number().int(),
    currency: currencySchema,
    status: z.string(),
    createdAt: z.string().optional(),
    created_at: z.string().optional()
  })
  .loose();

export type PaystackProviderOptions = {
  secretKey: string;
  baseUrl?: string;
  transport?: HttpTransport;
  includeRaw?: boolean;
};

export class PaystackPaymentProvider implements PaymentProvider {
  readonly metadata = {
    id: "paystack",
    name: "Paystack",
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
    documentationUrl: "https://paystack.com/docs/api/transaction/",
    verifiedAt: "2026-10-04"
  };
  readonly #baseUrl: string;
  readonly #transport: HttpTransport;
  readonly #includeRaw: boolean;

  constructor(private readonly options: PaystackProviderOptions) {
    if (!options.secretKey)
      throw new AuthenticationError("Paystack secret key is required", { provider: "paystack" });
    this.#baseUrl = (options.baseUrl ?? "https://api.paystack.co").replace(/\/$/, "");
    this.#transport = options.transport ?? fetchTransport;
    this.#includeRaw = options.includeRaw ?? false;
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const response = await this.#request("POST", "/transaction/initialize", {
      email: input.customer.email,
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      ...(input.metadata ? { metadata: JSON.stringify(input.metadata) } : {})
    });
    const data = z
      .object({ authorization_url: z.url(), access_code: z.string(), reference: z.string() })
      .parse(response.data);
    const now = new Date().toISOString();
    return {
      id: data.access_code,
      provider: "paystack",
      reference: data.reference,
      // access_code resumes checkout but is not a transaction ID for fetch/refund operations.
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "pending",
      customer: input.customer,
      checkoutUrl: data.authorization_url,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      ...(this.#includeRaw ? { raw: response } : {})
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<Payment> {
    const response = await this.#request(
      "GET",
      `/transaction/verify/${encodeURIComponent(input.reference)}`
    );
    return this.#mapTransaction(response.data, input.reference, response);
  }

  async getPayment(input: GetPaymentInput): Promise<Payment> {
    if (!input.providerReference) return this.verifyPayment(input);
    const response = await this.#request(
      "GET",
      `/transaction/${encodeURIComponent(input.providerReference)}`
    );
    return this.#mapTransaction(response.data, input.reference, response);
  }

  async refundPayment(input: RefundPaymentInput): Promise<Refund> {
    const response = await this.#request("POST", "/refund", {
      transaction: input.providerReference ?? input.reference,
      ...(input.amountMinor ? { amount: input.amountMinor } : {}),
      ...(input.reason ? { merchant_note: input.reason } : {})
    });
    const data = refundSchema.parse(response.data);
    return {
      id: String(data.id),
      provider: "paystack",
      paymentReference: input.reference,
      providerReference: String(data.id),
      amountMinor: String(data.amount),
      currency: data.currency,
      status: mapRefundStatus(data.status),
      createdAt: data.createdAt ?? data.created_at ?? new Date().toISOString(),
      ...(this.#includeRaw ? { raw: response } : {})
    };
  }

  verifyWebhook(input: WebhookInput): void {
    const signature = getHeader(input.headers, "x-paystack-signature");
    const expected = createHmac("sha512", this.options.secretKey)
      .update(input.rawBody)
      .digest("hex");
    if (!signature || !safeEqual(expected, signature)) {
      throw new WebhookVerificationError("Invalid Paystack webhook signature", {
        provider: "paystack",
        code: "INVALID_WEBHOOK_SIGNATURE"
      });
    }
  }

  parseWebhook(input: WebhookInput): CanonicalPaymentEvent {
    this.verifyWebhook(input);
    const raw = JSON.parse(new TextDecoder().decode(input.rawBody)) as unknown;
    const event = z.object({ event: z.string(), data: transactionSchema }).parse(raw);
    const payment = this.#mapTransaction(event.data, event.data.reference, event.data);
    const providerEventId = `${event.event}:${String(event.data.id)}:${event.data.status}`;
    return {
      id: createHash("sha256").update(`paystack:${providerEventId}`).digest("hex"),
      type: mapEvent(event.event, payment.status),
      provider: "paystack",
      providerEventId,
      createdAt: payment.updatedAt,
      data: { payment }
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
          "Content-Type": "application/json"
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (cause) {
      throw new NetworkError("Could not reach Paystack", {
        provider: "paystack",
        code: "NETWORK_ERROR",
        retryable: true,
        cause
      });
    }
    const parsed = envelopeSchema.safeParse(response.body);
    if (!parsed.success) {
      throw new ProviderUnavailableError("Paystack returned a malformed response", {
        provider: "paystack",
        code: "MALFORMED_RESPONSE",
        retryable: response.status >= 500,
        cause: parsed.error
      });
    }
    if (response.status >= 400 || !parsed.data.status)
      throwPaystackError(response.status, parsed.data);
    return parsed.data;
  }

  #mapTransaction(value: unknown, fallbackReference: string, raw: unknown): Payment {
    const data = transactionSchema.parse(value);
    const createdAt = data.created_at ?? data.paid_at ?? new Date().toISOString();
    const customerName = [data.customer?.first_name, data.customer?.last_name]
      .filter(Boolean)
      .join(" ");
    return {
      id: String(data.id),
      provider: "paystack",
      reference: data.reference || fallbackReference,
      providerReference: String(data.id),
      amountMinor: String(data.amount),
      currency: data.currency,
      status: mapStatus(data.status),
      customer: {
        email: data.customer?.email ?? "unknown@invalid.local",
        ...(customerName ? { name: customerName } : {}),
        ...(data.customer?.phone ? { phone: data.customer.phone } : {})
      },
      ...(data.channel ? { paymentMethod: data.channel } : {}),
      ...(data.status === "failed" && data.gateway_response
        ? { failureMessage: data.gateway_response }
        : {}),
      metadata: isRecord(data.metadata) ? data.metadata : {},
      createdAt,
      updatedAt: data.paid_at ?? createdAt,
      ...(this.#includeRaw ? { raw } : {})
    };
  }
}

function mapStatus(status: string): PaymentStatus {
  if (status === "success") return "succeeded";
  if (["failed", "reversed"].includes(status)) return "failed";
  if (status === "abandoned") return "cancelled";
  if (["processing", "ongoing", "pending"].includes(status)) return "processing";
  return "pending";
}

function mapRefundStatus(status: string): Refund["status"] {
  if (["processed", "completed"].includes(status)) return "succeeded";
  if (["failed", "cancelled"].includes(status)) return "failed";
  if (status === "processing") return "processing";
  return "pending";
}

function mapEvent(event: string, status: PaymentStatus): CanonicalPaymentEvent["type"] {
  if (event === "refund.processed") return "payment.refunded";
  if (status === "succeeded") return "payment.succeeded";
  if (status === "failed" || status === "cancelled") return "payment.failed";
  if (status === "processing") return "payment.processing";
  return "payment.created";
}

function throwPaystackError(status: number, body: z.infer<typeof envelopeSchema>): never {
  const options = {
    provider: "paystack",
    code: body.code ?? "PAYSTACK_ERROR",
    retryable: status >= 500,
    ...(body.code ? { providerCode: body.code } : {})
  };
  if (status === 401 || status === 403) throw new AuthenticationError(body.message, options);
  if (status === 429) throw new RateLimitError(body.message, { ...options, retryable: true });
  if (status >= 500) throw new ProviderUnavailableError(body.message, options);
  if (body.type === "processor_error") throw new PaymentDeclinedError(body.message, options);
  throw new InvalidRequestError(body.message, options);
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
