import {
  AuthenticationError,
  InvalidRequestError,
  NetworkError,
  ProviderUnavailableError
} from "@africa-dev/core";
import type { HttpTransport } from "@africa-dev/payments-core";
import { fetchTransport } from "@africa-dev/payments-core";
import type {
  Message,
  MessagingProvider,
  Otp,
  OtpVerification,
  SendOtpInput,
  SendSmsInput,
  VerifyOtpInput
} from "@africa-dev/messaging-core";
import { z } from "zod";

const sentSchema = z
  .object({
    code: z.string(),
    message_id: z.union([z.string(), z.number()]).optional(),
    message_id_str: z.string().optional(),
    message: z.string().optional()
  })
  .loose();
export type TermiiOptions = {
  apiKey: string;
  baseUrl: string;
  transport?: HttpTransport;
  includeRaw?: boolean;
};
export class TermiiMessagingProvider implements MessagingProvider {
  readonly metadata = {
    id: "termii",
    name: "Termii",
    category: "messaging" as const,
    countries: ["NG"],
    capabilities: ["messaging.sendSms", "messaging.sendOtp", "messaging.verifyOtp"],
    environments: ["test" as const, "live" as const],
    documentationUrl: "https://developers.termii.com/messaging-api",
    verifiedAt: "2026-10-04"
  };
  readonly #transport: HttpTransport;
  readonly #baseUrl: string;
  constructor(private readonly options: TermiiOptions) {
    if (!options.apiKey)
      throw new AuthenticationError("Termii API key is required", { provider: "termii" });
    if (!options.baseUrl)
      throw new InvalidRequestError("Termii regional base URL is required", { provider: "termii" });
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#transport = options.transport ?? fetchTransport;
  }
  async sendSms(input: SendSmsInput): Promise<Message> {
    const raw = await this.#post("/api/sms/send", {
      api_key: this.options.apiKey,
      to: input.recipient,
      from: input.senderId,
      sms: input.message,
      type: "plain",
      channel: input.transactional ? "dnd" : "generic"
    });
    const data = sentSchema.parse(raw);
    const reference =
      data.message_id_str ?? (data.message_id === undefined ? undefined : String(data.message_id));
    return {
      id: reference ?? input.idempotencyKey,
      provider: "termii",
      channel: "sms",
      recipient: input.recipient,
      status: data.code.toLowerCase() === "ok" ? "sent" : "failed",
      ...(reference ? { providerReference: reference } : {}),
      ...(this.options.includeRaw ? { raw } : {})
    };
  }
  async sendOtp(input: SendOtpInput): Promise<Otp> {
    const raw = await this.#post("/api/sms/otp/send", {
      api_key: this.options.apiKey,
      message_type: "NUMERIC",
      to: input.recipient,
      from: input.senderId,
      channel: input.transactional ? "dnd" : "generic",
      pin_attempts: input.attempts ?? 3,
      pin_time_to_live: input.ttlMinutes ?? 5,
      pin_length: input.pinLength ?? 6,
      pin_placeholder: input.pinPlaceholder,
      message_text: input.message,
      pin_type: "NUMERIC"
    });
    const data = z
      .object({
        pin_id: z.string().optional(),
        pinId: z.string().optional(),
        status: z.union([z.string(), z.number()]).optional()
      })
      .loose()
      .parse(raw);
    const reference = data.pin_id ?? data.pinId;
    if (!reference)
      throw new ProviderUnavailableError("Termii OTP response did not include a PIN ID", {
        provider: "termii",
        code: "MALFORMED_RESPONSE"
      });
    return {
      id: reference,
      provider: "termii",
      recipient: input.recipient,
      providerReference: reference,
      status: String(data.status ?? "200") === "200" ? "sent" : "failed"
    };
  }
  async verifyOtp(input: VerifyOtpInput): Promise<OtpVerification> {
    const raw = await this.#post("/api/sms/otp/verify", {
      api_key: this.options.apiKey,
      pin_id: input.providerReference,
      pin: input.pin
    });
    const data = z
      .object({ verified: z.union([z.string(), z.boolean()]) })
      .loose()
      .parse(raw);
    return {
      provider: "termii",
      providerReference: input.providerReference,
      verified: data.verified === true || data.verified.toString().toLowerCase() === "true"
    };
  }
  async #post(path: string, body: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await this.#transport({
        method: "POST",
        url: `${this.#baseUrl}${path}`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (response.status >= 500)
        throw new ProviderUnavailableError("Termii is unavailable", {
          provider: "termii",
          retryable: true
        });
      if (response.status >= 400)
        throw new InvalidRequestError("Termii rejected the request", { provider: "termii" });
      return response.body;
    } catch (error) {
      if (error instanceof ProviderUnavailableError || error instanceof InvalidRequestError)
        throw error;
      throw new NetworkError("Could not reach Termii", {
        provider: "termii",
        retryable: true,
        cause: error
      });
    }
  }
}
