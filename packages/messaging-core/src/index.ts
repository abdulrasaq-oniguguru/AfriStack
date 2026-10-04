import type { ProviderMetadata } from "@africa-dev/core";

export type Message = {
  id: string;
  provider: string;
  channel: "sms";
  recipient: string;
  status: "queued" | "sent" | "failed";
  providerReference?: string;
  costMinor?: string;
  currency?: string;
  raw?: unknown;
};
export type SendSmsInput = {
  recipient: string;
  message: string;
  senderId: string;
  idempotencyKey: string;
  transactional?: boolean;
};
export type SendOtpInput = {
  recipient: string;
  senderId: string;
  message: string;
  pinPlaceholder: string;
  pinLength?: number;
  ttlMinutes?: number;
  attempts?: number;
  transactional?: boolean;
};
export type Otp = {
  id: string;
  provider: string;
  recipient: string;
  status: "sent" | "failed";
  providerReference: string;
};
export type VerifyOtpInput = { providerReference: string; pin: string };
export type OtpVerification = { provider: string; providerReference: string; verified: boolean };
export interface MessagingProvider {
  readonly metadata: ProviderMetadata;
  sendSms(input: SendSmsInput): Promise<Message>;
  sendOtp?(input: SendOtpInput): Promise<Otp>;
  verifyOtp?(input: VerifyOtpInput): Promise<OtpVerification>;
}
