export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Africa Dev Gateway",
    version: "0.1.0-alpha.0",
    description:
      "Self-hosted provider abstraction gateway. Provider accounts and funds remain with the operator."
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: { projectApiKey: { type: "apiKey", in: "header", name: "x-api-key" } },
    schemas: {
      Payment: {
        type: "object",
        required: ["id", "provider", "reference", "amountMinor", "currency", "status"],
        properties: {
          id: { type: "string" },
          provider: { type: "string" },
          reference: { type: "string" },
          providerReference: { type: "string" },
          amountMinor: { type: "string", pattern: "^[0-9]+$" },
          currency: { type: "string", minLength: 3, maxLength: 3 },
          status: { type: "string" },
          checkoutUrl: { type: "string", format: "uri" }
        }
      }
    }
  },
  security: [{ projectApiKey: [] }],
  paths: {
    "/health": { get: { security: [], responses: { "200": { description: "Process is alive" } } } },
    "/ready": {
      get: {
        security: [],
        responses: {
          "200": { description: "Dependencies are ready" },
          "503": { description: "Not ready" }
        }
      }
    },
    "/v1/payments": {
      post: {
        parameters: [
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } }
        },
        responses: {
          "201": {
            description: "Payment initialized",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Payment" } } }
          }
        }
      }
    },
    "/v1/payments/{reference}": {
      get: {
        parameters: [{ name: "reference", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Verified payment" } }
      }
    },
    "/v1/payments/{reference}/refunds": {
      post: {
        parameters: [
          { name: "reference", in: "path", required: true, schema: { type: "string" } },
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }
        ],
        responses: { "201": { description: "Refund initiated" } }
      }
    },
    "/v1/webhooks/{provider}": {
      post: {
        security: [],
        parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Durably accepted or duplicate" },
          "401": { description: "Invalid signature" }
        }
      }
    },
    "/v1/capabilities": {
      get: { responses: { "200": { description: "Configured capabilities" } } }
    },
    "/v1/countries": { get: { responses: { "200": { description: "Country registry" } } } },
    "/v1/events": {
      get: {
        description: "Read project-scoped normalized webhook events using cursor pagination.",
        parameters: [
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } }
        ],
        responses: {
          "200": { description: "Normalized event page" },
          "401": { description: "Invalid API key" }
        }
      }
    },
    "/v1/messages": {
      post: {
        description: "Send an SMS through a configured messaging provider.",
        parameters: [
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }
        ],
        responses: {
          "201": { description: "Canonical message" },
          "400": { description: "Invalid request" },
          "409": { description: "Idempotency conflict" }
        }
      }
    },
    "/v1/otp": {
      post: {
        description: "Send an OTP through a configured provider that implements OTP delivery.",
        parameters: [
          { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }
        ],
        responses: {
          "201": { description: "OTP delivery initiated" },
          "422": { description: "OTP capability unavailable" }
        }
      }
    },
    "/v1/otp/verify": {
      post: {
        description: "Verify an OTP with the selected messaging provider.",
        responses: {
          "200": { description: "OTP verification result" },
          "422": { description: "OTP capability unavailable" }
        }
      }
    },
    "/v1/api-keys": {
      post: {
        description: "Create a project API key. Test keys cannot create live keys.",
        responses: {
          "201": { description: "New key; shown exactly once" },
          "403": { description: "Insufficient key scope" }
        }
      }
    },
    "/v1/api-keys/{prefix}": {
      delete: {
        description: "Revoke a project API key by prefix.",
        parameters: [{ name: "prefix", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "204": { description: "Key revoked" },
          "404": { description: "Key not found" }
        }
      }
    }
  }
} as const;
