export type AfricaErrorOptions = {
  provider?: string;
  code?: string;
  retryable?: boolean;
  providerCode?: string;
  requestId?: string;
  cause?: unknown;
};

export class AfricaError extends Error {
  readonly provider: string | undefined;
  readonly code: string;
  readonly retryable: boolean;
  readonly providerCode: string | undefined;
  readonly requestId: string | undefined;

  constructor(message: string, options: AfricaErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? "AFRICA_ERROR";
    this.retryable = options.retryable ?? false;
    this.provider = options.provider;
    this.providerCode = options.providerCode;
    this.requestId = options.requestId;
  }
}

export class AuthenticationError extends AfricaError {}
export class InvalidRequestError extends AfricaError {}
export class ProviderUnavailableError extends AfricaError {}
export class RateLimitError extends AfricaError {}
export class PaymentDeclinedError extends AfricaError {}
export class UnsupportedCapabilityError extends AfricaError {}
export class ConfigurationError extends AfricaError {}
export class NetworkError extends AfricaError {}
export class WebhookVerificationError extends AfricaError {}

const SECRET_PATTERNS = [
  /\bsk_(?:test|live)_[A-Za-z0-9_-]+\b/g,
  /\bFLWSECK(?:_TEST)?-[A-Za-z0-9_-]+\b/gi,
  /\bBearer\s+[A-Za-z0-9._~-]+\b/gi,
  /\bafd_(?:test|live)_[A-Za-z0-9_-]+\b/g
];

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value
  );
}
