import type { ProviderMetadata } from "@africa-dev/core";
import type { SupportedCurrency } from "@africa-dev/country-data";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type PaymentCustomer = { email: string; name?: string; phone?: string };

export type Payment = {
  id: string;
  provider: string;
  reference: string;
  providerReference?: string;
  amountMinor: string;
  currency: SupportedCurrency;
  status: PaymentStatus;
  customer: PaymentCustomer;
  paymentMethod?: string;
  checkoutUrl?: string;
  failureCode?: string;
  failureMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  raw?: unknown;
};

export type CreatePaymentInput = {
  amountMinor: string;
  currency: SupportedCurrency;
  customer: PaymentCustomer;
  reference: string;
  idempotencyKey: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
};

export type VerifyPaymentInput = { reference: string; providerReference?: string };
export type GetPaymentInput = VerifyPaymentInput;
export type RefundPaymentInput = {
  reference: string;
  providerReference?: string;
  amountMinor?: string;
  idempotencyKey: string;
  reason?: string;
};

export type Refund = {
  id: string;
  provider: string;
  paymentReference: string;
  providerReference?: string;
  amountMinor: string;
  currency: SupportedCurrency;
  status: "pending" | "processing" | "succeeded" | "failed";
  createdAt: string;
  raw?: unknown;
};

export type CanonicalPaymentEventType =
  | "payment.created"
  | "payment.processing"
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded";

export type CanonicalPaymentEvent = {
  id: string;
  type: CanonicalPaymentEventType;
  provider: string;
  providerEventId: string;
  createdAt: string;
  data: { payment: Payment };
};

export type WebhookInput = {
  rawBody: Uint8Array;
  headers: Readonly<Record<string, string | string[] | undefined>>;
};

export interface PaymentProvider {
  readonly metadata: ProviderMetadata;
  createPayment(input: CreatePaymentInput): Promise<Payment>;
  verifyPayment(input: VerifyPaymentInput): Promise<Payment>;
  getPayment(input: GetPaymentInput): Promise<Payment>;
  refundPayment(input: RefundPaymentInput): Promise<Refund>;
  verifyWebhook(input: WebhookInput): Promise<void> | void;
  parseWebhook(input: WebhookInput): Promise<CanonicalPaymentEvent> | CanonicalPaymentEvent;
}

export type PaymentProviderFactory = () => PaymentProvider;
