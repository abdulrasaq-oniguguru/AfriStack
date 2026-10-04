import { ConfigurationError, UnsupportedCapabilityError } from "@africa-dev/core";
import type {
  Message,
  MessagingProvider,
  Otp,
  OtpVerification,
  SendOtpInput,
  SendSmsInput,
  VerifyOtpInput
} from "@africa-dev/messaging-core";
import type {
  CreatePaymentInput,
  GetPaymentInput,
  Payment,
  PaymentProvider,
  Refund,
  RefundPaymentInput,
  VerifyPaymentInput
} from "@africa-dev/payments-core";

export type AfricaConfig = {
  country: string;
  payments: { providers: PaymentProvider[]; strategy: "explicit" | "priority" };
  messaging?: { providers: MessagingProvider[]; strategy: "explicit" | "priority" };
};
export type ProviderSelection = { provider?: string };

export class Africa {
  readonly payments: PaymentsClient;
  readonly messaging?: MessagingClient;
  constructor(readonly config: AfricaConfig) {
    if (config.payments.providers.length === 0)
      throw new ConfigurationError("At least one payment provider is required");
    this.payments = new PaymentsClient(config.payments);
    if (config.messaging) {
      if (config.messaging.providers.length === 0)
        throw new ConfigurationError("At least one messaging provider is required");
      this.messaging = new MessagingClient(config.messaging);
    }
  }
}

export class MessagingClient {
  readonly #providers = new Map<string, MessagingProvider>();

  constructor(private readonly config: NonNullable<AfricaConfig["messaging"]>) {
    for (const provider of config.providers) this.#providers.set(provider.metadata.id, provider);
  }

  send(input: SendSmsInput, selection: ProviderSelection = {}): Promise<Message> {
    return this.#select(selection).sendSms(input);
  }

  sendOtp(input: SendOtpInput, selection: ProviderSelection = {}): Promise<Otp> {
    const provider = this.#select(selection);
    if (!provider.sendOtp)
      throw new UnsupportedCapabilityError(
        `Messaging provider '${provider.metadata.id}' does not support OTP delivery`,
        { code: "OTP_NOT_SUPPORTED", provider: provider.metadata.id }
      );
    return provider.sendOtp(input);
  }

  verifyOtp(input: VerifyOtpInput, selection: ProviderSelection = {}): Promise<OtpVerification> {
    const provider = this.#select(selection);
    if (!provider.verifyOtp)
      throw new UnsupportedCapabilityError(
        `Messaging provider '${provider.metadata.id}' does not support OTP verification`,
        { code: "OTP_NOT_SUPPORTED", provider: provider.metadata.id }
      );
    return provider.verifyOtp(input);
  }

  #select(selection: ProviderSelection): MessagingProvider {
    if (selection.provider) {
      const selected = this.#providers.get(selection.provider);
      if (!selected)
        throw new UnsupportedCapabilityError(
          `Messaging provider '${selection.provider}' is not configured`,
          { code: "PROVIDER_NOT_CONFIGURED" }
        );
      return selected;
    }
    if (this.config.strategy === "explicit")
      throw new ConfigurationError("Explicit messaging routing requires a provider selection", {
        code: "PROVIDER_REQUIRED"
      });
    const first = this.config.providers[0];
    if (!first) throw new ConfigurationError("No messaging provider is configured");
    return first;
  }
}

export class PaymentsClient {
  readonly #providers = new Map<string, PaymentProvider>();
  constructor(private readonly config: AfricaConfig["payments"]) {
    for (const provider of config.providers) this.#providers.set(provider.metadata.id, provider);
  }
  create(input: CreatePaymentInput, selection: ProviderSelection = {}): Promise<Payment> {
    return this.#select(selection).createPayment(input);
  }
  verify(input: VerifyPaymentInput, selection: ProviderSelection = {}): Promise<Payment> {
    return this.#select(selection).verifyPayment(input);
  }
  get(input: GetPaymentInput, selection: ProviderSelection = {}): Promise<Payment> {
    return this.#select(selection).getPayment(input);
  }
  refund(input: RefundPaymentInput, selection: ProviderSelection = {}): Promise<Refund> {
    return this.#select(selection).refundPayment(input);
  }

  #select(selection: ProviderSelection): PaymentProvider {
    if (selection.provider) {
      const selected = this.#providers.get(selection.provider);
      if (!selected)
        throw new UnsupportedCapabilityError(
          `Payment provider '${selection.provider}' is not configured`,
          { code: "PROVIDER_NOT_CONFIGURED" }
        );
      return selected;
    }
    if (this.config.strategy === "explicit")
      throw new ConfigurationError("Explicit payment routing requires a provider selection", {
        code: "PROVIDER_REQUIRED"
      });
    const first = this.config.providers[0];
    if (!first) throw new ConfigurationError("No payment provider is configured");
    return first;
  }
}

export function defineConfig<const T extends AfricaConfig>(config: T): T {
  return config;
}
