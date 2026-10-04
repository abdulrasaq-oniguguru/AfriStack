import {
  AuthenticationError,
  InvalidRequestError,
  NetworkError,
  ProviderUnavailableError
} from "@africa-dev/core";
import type { Message, MessagingProvider, SendSmsInput } from "@africa-dev/messaging-core";
import { fetchTransport, type HttpTransport } from "@africa-dev/payments-core";
import { z } from "zod";
const responseSchema = z
  .object({
    SMSMessageData: z
      .object({
        Recipients: z
          .array(
            z
              .object({
                number: z.string().optional(),
                status: z.string().optional(),
                messageId: z.string().optional()
              })
              .loose()
          )
          .default([])
      })
      .loose()
  })
  .loose();
export type AfricasTalkingOptions = {
  apiKey: string;
  username: string;
  baseUrl?: string;
  transport?: HttpTransport;
  includeRaw?: boolean;
};
export class AfricasTalkingMessagingProvider implements MessagingProvider {
  readonly metadata = {
    id: "africastalking",
    name: "Africa's Talking",
    category: "messaging" as const,
    countries: [],
    capabilities: ["messaging.sendSms"],
    environments: ["test" as const, "live" as const],
    documentationUrl: "https://developers.africastalking.com/docs/sms/overview",
    verifiedAt: "2026-10-04"
  };
  readonly #transport: HttpTransport;
  readonly #baseUrl: string;
  constructor(private readonly options: AfricasTalkingOptions) {
    if (!options.apiKey || !options.username)
      throw new AuthenticationError("Africa's Talking API key and username are required", {
        provider: "africastalking"
      });
    this.#baseUrl = (options.baseUrl ?? "https://api.africastalking.com/version1").replace(
      /\/$/,
      ""
    );
    this.#transport = options.transport ?? fetchTransport;
  }
  async sendSms(input: SendSmsInput): Promise<Message> {
    const body = new URLSearchParams({
      username: this.options.username,
      to: input.recipient,
      message: input.message,
      bulkSMSMode: "1",
      ...(input.senderId ? { from: input.senderId } : {})
    }).toString();
    try {
      const response = await this.#transport({
        method: "POST",
        url: `${this.#baseUrl}/messaging`,
        headers: {
          apikey: this.options.apiKey,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });
      if (response.status >= 500)
        throw new ProviderUnavailableError("Africa's Talking is unavailable", {
          provider: "africastalking",
          retryable: true
        });
      if (response.status >= 400)
        throw new InvalidRequestError("Africa's Talking rejected the request", {
          provider: "africastalking"
        });
      const raw = responseSchema.parse(response.body);
      const recipient = raw.SMSMessageData.Recipients[0];
      const status = recipient?.status?.toLowerCase() === "success" ? "sent" : "queued";
      return {
        id: recipient?.messageId ?? input.idempotencyKey,
        provider: "africastalking",
        channel: "sms",
        recipient: input.recipient,
        status,
        ...(recipient?.messageId ? { providerReference: recipient.messageId } : {}),
        ...(this.options.includeRaw ? { raw: response.body } : {})
      };
    } catch (error) {
      if (error instanceof ProviderUnavailableError || error instanceof InvalidRequestError)
        throw error;
      throw new NetworkError("Could not reach Africa's Talking", {
        provider: "africastalking",
        retryable: true,
        cause: error
      });
    }
  }
}
