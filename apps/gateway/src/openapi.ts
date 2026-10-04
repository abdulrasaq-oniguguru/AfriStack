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
    "/v1/countries": { get: { responses: { "200": { description: "Country registry" } } } }
  }
} as const;
