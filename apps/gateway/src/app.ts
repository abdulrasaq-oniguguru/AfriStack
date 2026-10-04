import { createHash } from "node:crypto";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  AfricaError,
  ConfigurationError,
  InvalidRequestError,
  WebhookVerificationError,
  redactSecrets,
  serializeErrorForLog
} from "@africa-dev/core";
import { capabilities, countries } from "@africa-dev/country-data";
import type { MessagingProvider } from "@africa-dev/messaging-core";
import type { PaymentProvider } from "@africa-dev/payments-core";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { generateApiKey } from "./api-keys.js";
import { openApiDocument } from "./openapi.js";
import type { GatewayRepository, Project } from "./repository.js";

export type BuildGatewayOptions = {
  repository: GatewayRepository;
  providers: PaymentProvider[];
  messagingProviders?: MessagingProvider[];
  country?: string;
  logger?: boolean;
};

const paymentRequestSchema = z.object({
  provider: z.string().min(1).optional(),
  amountMinor: z.string().regex(/^\d+$/),
  currency: z.enum(["NGN", "GHS", "KES", "ZAR", "UGX", "TZS", "RWF", "XOF", "XAF", "USD"]),
  customer: z.object({
    email: z.email(),
    name: z.string().min(1).optional(),
    phone: z.string().min(5).optional()
  }),
  reference: z.string().min(1).max(100),
  callbackUrl: z.url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
const refundRequestSchema = z.object({
  amountMinor: z.string().regex(/^\d+$/).optional(),
  reason: z.string().max(500).optional()
});
const messageRequestSchema = z.object({
  provider: z.string().min(1).optional(),
  recipient: z.string().min(5).max(50),
  message: z.string().min(1).max(1600),
  senderId: z.string().min(1).max(20),
  transactional: z.boolean().optional()
});
const otpRequestSchema = z.object({
  provider: z.string().min(1).optional(),
  recipient: z.string().min(5).max(50),
  senderId: z.string().min(1).max(20),
  message: z.string().min(1).max(1600),
  pinLength: z.number().int().min(4).max(10).optional(),
  ttlMinutes: z.number().int().min(1).max(60).optional(),
  attempts: z.number().int().min(1).max(10).optional()
});
const verifyOtpRequestSchema = z.object({
  provider: z.string().min(1).optional(),
  providerReference: z.string().min(1).max(200),
  pin: z.string().min(1).max(20)
});

export async function buildGateway(options: BuildGatewayOptions): Promise<FastifyInstance> {
  if (options.providers.length === 0)
    throw new ConfigurationError("Gateway requires at least one payment provider");
  const providerMap = new Map(
    options.providers.map((provider) => [provider.metadata.id, provider])
  );
  const messagingProviders = options.messagingProviders ?? [];
  const messagingProviderMap = new Map(
    messagingProviders.map((provider) => [provider.metadata.id, provider])
  );
  const authenticatedProjects = new WeakMap<FastifyRequest, Project>();
  const app = Fastify({
    logger: options.logger
      ? {
          level: "info",
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.x-api-key",
              "*.secretKey",
              "*.apiKey",
              "*.otp"
            ],
            censor: "[REDACTED]"
          }
        }
      : false,
    bodyLimit: 1_048_576,
    requestIdHeader: "x-request-id"
  });

  await app.register(helmet, { global: true });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: 1_048_576 },
    (_request, body, done) => done(null, body)
  );

  app.addHook("onRequest", async (request, reply) => {
    if (isPublicRoute(request)) return;
    const key = header(request, "x-api-key") ?? bearerToken(request);
    if (!key)
      return reply.code(401).send({
        error: { code: "AUTHENTICATION_REQUIRED", message: "A project API key is required" }
      });
    const project = await options.repository.authenticateApiKey(key);
    if (!project)
      return reply.code(401).send({
        error: { code: "INVALID_API_KEY", message: "The project API key is invalid or revoked" }
      });
    authenticatedProjects.set(request, project);
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    const ready = await options.repository.ready();
    return reply.code(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready" });
  });
  app.get("/openapi.json", async () => openApiDocument);

  app.get("/v1/countries", async () => ({ data: Object.values(countries) }));
  app.get("/v1/capabilities", async (request) => {
    const query = z
      .object({
        country: z
          .string()
          .length(2)
          .default(options.country ?? "NG"),
        service: z.enum(["payments", "messaging", "identity", "mobile_money"]).default("payments")
      })
      .parse(request.query);
    return { data: capabilities(query) };
  });
  app.get("/v1/events", async (request) => {
    const project = requiredProject(authenticatedProjects, request);
    const query = z
      .object({
        cursor: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50)
      })
      .parse(request.query);
    return options.repository.listWebhookEvents(project.id, query.cursor, query.limit);
  });

  app.post("/v1/payments", async (request, reply) => {
    const project = requiredProject(authenticatedProjects, request);
    const body = parseJsonBody(request.body, paymentRequestSchema);
    const idempotencyKey = requiredIdempotencyKey(request);
    const claim = await options.repository.claimIdempotency(
      project.id,
      idempotencyKey,
      "payment.create",
      fingerprint(body)
    );
    if (claim.state === "replay") return reply.code(claim.responseStatus).send(claim.responseBody);
    if (claim.state === "conflict")
      return reply.code(409).send({
        error: {
          code: "IDEMPOTENCY_CONFLICT",
          message: "The idempotency key was already used for a different request"
        }
      });
    if (claim.state === "processing")
      return reply.code(409).send({
        error: {
          code: "IDEMPOTENCY_IN_PROGRESS",
          message: "A request with this idempotency key is already processing"
        }
      });

    const payment = await releaseOnDefinitiveFailure(
      options.repository,
      project.id,
      idempotencyKey,
      () =>
        selectProvider(providerMap, options.providers, body.provider).createPayment({
          amountMinor: body.amountMinor,
          currency: body.currency,
          customer: {
            email: body.customer.email,
            ...(body.customer.name ? { name: body.customer.name } : {}),
            ...(body.customer.phone ? { phone: body.customer.phone } : {})
          },
          reference: body.reference,
          idempotencyKey,
          ...(body.callbackUrl ? { callbackUrl: body.callbackUrl } : {}),
          ...(body.metadata ? { metadata: body.metadata } : {})
        })
    );
    await options.repository.savePayment(project.id, payment);
    await options.repository.completeIdempotency(project.id, idempotencyKey, 201, payment);
    return reply.code(201).send(payment);
  });

  app.get<{ Params: { reference: string } }>("/v1/payments/:reference", async (request, reply) => {
    const project = requiredProject(authenticatedProjects, request);
    const stored = await options.repository.getPayment(project.id, request.params.reference);
    if (!stored)
      return reply
        .code(404)
        .send({ error: { code: "PAYMENT_NOT_FOUND", message: "Payment was not found" } });
    const provider = selectProvider(providerMap, options.providers, stored.provider);
    const payment = await provider.verifyPayment({
      reference: stored.reference,
      ...(stored.providerReference ? { providerReference: stored.providerReference } : {})
    });
    await options.repository.savePayment(project.id, payment);
    return payment;
  });

  app.post<{ Params: { reference: string } }>(
    "/v1/payments/:reference/refunds",
    async (request, reply) => {
      const project = requiredProject(authenticatedProjects, request);
      const body = parseJsonBody(request.body, refundRequestSchema);
      const payment = await options.repository.getPayment(project.id, request.params.reference);
      if (!payment)
        return reply
          .code(404)
          .send({ error: { code: "PAYMENT_NOT_FOUND", message: "Payment was not found" } });
      const idempotencyKey = requiredIdempotencyKey(request);
      const claim = await options.repository.claimIdempotency(
        project.id,
        idempotencyKey,
        "payment.refund",
        fingerprint({ reference: payment.reference, ...body })
      );
      if (claim.state === "replay")
        return reply.code(claim.responseStatus).send(claim.responseBody);
      if (claim.state !== "claimed")
        return reply.code(409).send({
          error: {
            code: claim.state === "conflict" ? "IDEMPOTENCY_CONFLICT" : "IDEMPOTENCY_IN_PROGRESS",
            message: "The idempotency key cannot be used for this request"
          }
        });
      const refund = await releaseOnDefinitiveFailure(
        options.repository,
        project.id,
        idempotencyKey,
        () =>
          selectProvider(providerMap, options.providers, payment.provider).refundPayment({
            reference: payment.reference,
            idempotencyKey,
            ...(payment.providerReference ? { providerReference: payment.providerReference } : {}),
            ...(body.amountMinor ? { amountMinor: body.amountMinor } : {}),
            ...(body.reason ? { reason: body.reason } : {})
          })
      );
      await options.repository.completeIdempotency(project.id, idempotencyKey, 201, refund);
      return reply.code(201).send(refund);
    }
  );

  app.post<{ Params: { provider: string } }>("/v1/webhooks/:provider", async (request, reply) => {
    const provider = providerMap.get(request.params.provider);
    if (!provider)
      return reply.code(404).send({
        error: { code: "PROVIDER_NOT_CONFIGURED", message: "Provider is not configured" }
      });
    const rawBody = requireRawBody(request.body);
    const webhookInput = {
      rawBody,
      headers: normalizeHeaders(request.headers)
    };
    await provider.verifyWebhook(webhookInput);
    let event;
    try {
      event = await provider.parseWebhook(webhookInput);
    } catch (error) {
      request.log.info(
        { provider: provider.metadata.id, error: serializeErrorForLog(error) },
        "verified webhook event ignored because it is not supported"
      );
      return reply.code(200).send({ received: true, ignored: true });
    }
    const result = await options.repository.recordWebhookEvent(event);
    return reply.code(200).send({
      received: true,
      duplicate: !result.inserted,
      eventId: event.id,
      type: event.type,
      ...(result.projectId ? { projectId: result.projectId } : {})
    });
  });

  app.post("/v1/messages", async (request, reply) => {
    const project = requiredProject(authenticatedProjects, request);
    const body = parseJsonBody(request.body, messageRequestSchema);
    const idempotencyKey = requiredIdempotencyKey(request);
    const claim = await options.repository.claimIdempotency(
      project.id,
      idempotencyKey,
      "message.send",
      fingerprint(body)
    );
    if (claim.state === "replay") return reply.code(claim.responseStatus).send(claim.responseBody);
    if (claim.state !== "claimed") return idempotencyConflict(reply, claim.state);
    const message = await releaseOnDefinitiveFailure(
      options.repository,
      project.id,
      idempotencyKey,
      () => {
        const provider = selectMessagingProvider(
          messagingProviderMap,
          messagingProviders,
          body.provider
        );
        return provider.sendSms({
          recipient: body.recipient,
          message: body.message,
          idempotencyKey,
          senderId: body.senderId,
          ...(body.transactional !== undefined ? { transactional: body.transactional } : {})
        });
      }
    );
    await options.repository.saveMessage(project.id, message);
    await options.repository.completeIdempotency(project.id, idempotencyKey, 201, message);
    return reply.code(201).send(message);
  });

  app.post("/v1/otp", async (request, reply) => {
    const project = requiredProject(authenticatedProjects, request);
    const body = parseJsonBody(request.body, otpRequestSchema);
    const idempotencyKey = requiredIdempotencyKey(request);
    const claim = await options.repository.claimIdempotency(
      project.id,
      idempotencyKey,
      "otp.send",
      fingerprint(body)
    );
    if (claim.state === "replay") return reply.code(claim.responseStatus).send(claim.responseBody);
    if (claim.state !== "claimed") return idempotencyConflict(reply, claim.state);
    const otp = await releaseOnDefinitiveFailure(
      options.repository,
      project.id,
      idempotencyKey,
      () => {
        const provider = selectMessagingProvider(
          messagingProviderMap,
          messagingProviders,
          body.provider
        );
        if (!provider.sendOtp)
          throw new InvalidRequestError("Selected provider does not support OTP delivery", {
            code: "OTP_NOT_SUPPORTED",
            provider: provider.metadata.id
          });
        return provider.sendOtp({
          recipient: body.recipient,
          senderId: body.senderId,
          message: body.message,
          pinPlaceholder: "<pin>",
          ...(body.pinLength ? { pinLength: body.pinLength } : {}),
          ...(body.ttlMinutes ? { ttlMinutes: body.ttlMinutes } : {}),
          ...(body.attempts ? { attempts: body.attempts } : {})
        });
      }
    );
    await options.repository.completeIdempotency(project.id, idempotencyKey, 201, otp);
    return reply.code(201).send(otp);
  });

  app.post("/v1/otp/verify", async (request) => {
    const body = parseJsonBody(request.body, verifyOtpRequestSchema);
    const provider = selectMessagingProvider(
      messagingProviderMap,
      messagingProviders,
      body.provider
    );
    if (!provider.verifyOtp)
      throw new InvalidRequestError("Selected provider does not support OTP verification", {
        code: "OTP_NOT_SUPPORTED",
        provider: provider.metadata.id
      });
    return provider.verifyOtp({ providerReference: body.providerReference, pin: body.pin });
  });

  app.post("/v1/api-keys", async (request, reply) => {
    const project = requiredProject(authenticatedProjects, request);
    const body = parseJsonBody(request.body, z.object({ environment: z.enum(["test", "live"]) }));
    const generated = generateApiKey(body.environment);
    await options.repository.createApiKey(project.id, generated.prefix, generated.hash);
    return reply.code(201).send({ key: generated.key, prefix: generated.prefix });
  });

  app.delete<{ Params: { prefix: string } }>("/v1/api-keys/:prefix", async (request, reply) => {
    const project = requiredProject(authenticatedProjects, request);
    const revoked = await options.repository.revokeApiKey(project.id, request.params.prefix);
    return revoked
      ? reply.code(204).send()
      : reply
          .code(404)
          .send({ error: { code: "API_KEY_NOT_FOUND", message: "API key was not found" } });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.warn(
      { error: serializeErrorForLog(error), requestId: request.id },
      "request failed"
    );
    if (error instanceof WebhookVerificationError)
      return reply
        .code(401)
        .send({ error: { code: error.code, message: error.message, requestId: request.id } });
    if (error instanceof InvalidRequestError || error instanceof z.ZodError)
      return reply.code(400).send({
        error: {
          code: error instanceof AfricaError ? error.code : "INVALID_REQUEST",
          message: redactSecrets(error instanceof Error ? error.message : "Request rejected"),
          requestId: request.id
        }
      });
    if (error instanceof AfricaError)
      return reply.code(error.retryable ? 503 : 422).send({
        error: {
          code: error.code,
          message: redactSecrets(error.message),
          provider: error.provider,
          retryable: error.retryable,
          requestId: request.id
        }
      });
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && [413, 415, 429].includes(statusCode))
      return reply.code(statusCode).send({
        error: {
          code:
            statusCode === 413
              ? "PAYLOAD_TOO_LARGE"
              : statusCode === 415
                ? "UNSUPPORTED_MEDIA_TYPE"
                : "RATE_LIMITED",
          message: redactSecrets(error instanceof Error ? error.message : "Request rejected"),
          requestId: request.id
        }
      });
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred",
        requestId: request.id
      }
    });
  });

  app.addHook("onClose", async () => options.repository.close());
  return app;
}

function isPublicRoute(request: FastifyRequest): boolean {
  return (
    request.url === "/health" ||
    request.url === "/ready" ||
    request.url === "/openapi.json" ||
    request.url.startsWith("/v1/webhooks/")
  );
}
function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
function bearerToken(request: FastifyRequest): string | undefined {
  const value = header(request, "authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : undefined;
}
function requiredProject(
  projects: WeakMap<FastifyRequest, Project>,
  request: FastifyRequest
): Project {
  const project = projects.get(request);
  if (!project) throw new ConfigurationError("Authenticated project context is missing");
  return project;
}
function requiredIdempotencyKey(request: FastifyRequest): string {
  const key = header(request, "idempotency-key");
  if (!key || key.length > 200)
    throw new InvalidRequestError("A valid Idempotency-Key header is required", {
      code: "IDEMPOTENCY_KEY_REQUIRED"
    });
  return key;
}
function requireRawBody(value: unknown): Uint8Array {
  if (!Buffer.isBuffer(value))
    throw new InvalidRequestError("Webhook body must be JSON bytes", { code: "RAW_BODY_REQUIRED" });
  return value;
}
function parseJsonBody<T>(value: unknown, schema: z.ZodType<T>): T {
  if (!Buffer.isBuffer(value)) throw new InvalidRequestError("A JSON request body is required");
  try {
    return schema.parse(JSON.parse(value.toString("utf8")));
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new InvalidRequestError("Malformed JSON request body", { cause: error });
  }
}
function selectProvider(
  map: Map<string, PaymentProvider>,
  ordered: PaymentProvider[],
  requested?: string
): PaymentProvider {
  const provider = requested ? map.get(requested) : ordered[0];
  if (!provider)
    throw new InvalidRequestError(
      `Payment provider '${requested ?? "default"}' is not configured`,
      { code: "PROVIDER_NOT_CONFIGURED" }
    );
  return provider;
}
function selectMessagingProvider(
  map: Map<string, MessagingProvider>,
  ordered: MessagingProvider[],
  requested?: string
): MessagingProvider {
  const provider = requested ? map.get(requested) : ordered[0];
  if (!provider)
    throw new InvalidRequestError(
      `Messaging provider '${requested ?? "default"}' is not configured`,
      { code: "PROVIDER_NOT_CONFIGURED" }
    );
  return provider;
}
async function releaseOnDefinitiveFailure<T>(
  repository: GatewayRepository,
  projectId: string,
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AfricaError && !error.retryable && error.code !== "MALFORMED_RESPONSE")
      await repository.releaseIdempotency(projectId, key);
    throw error;
  }
}
function idempotencyConflict(reply: FastifyReply, state: "conflict" | "processing") {
  return reply.code(409).send({
    error: {
      code: state === "conflict" ? "IDEMPOTENCY_CONFLICT" : "IDEMPOTENCY_IN_PROGRESS",
      message: "The idempotency key cannot be used for this request"
    }
  });
}
function normalizeHeaders(
  headers: FastifyRequest["headers"]
): Record<string, string | string[] | undefined> {
  return { ...headers };
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
