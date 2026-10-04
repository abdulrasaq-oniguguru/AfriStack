import { ConfigurationError } from "@africa-dev/core";
import type { PaymentProvider } from "@africa-dev/payments-core";
import { FlutterwavePaymentProvider } from "@africa-dev/provider-flutterwave";
import { PaystackPaymentProvider } from "@africa-dev/provider-paystack";
import { AfricasTalkingMessagingProvider } from "@africa-dev/provider-africastalking";
import { TermiiMessagingProvider } from "@africa-dev/provider-termii";
import type { MessagingProvider } from "@africa-dev/messaging-core";
import { MockPaymentProvider } from "@africa-dev/testkit";
import { buildGateway } from "./app.js";
import { PostgresGatewayRepository } from "./postgres-repository.js";

const databaseUrl = requiredEnvironment("DATABASE_URL");
const bootstrapKey = bootstrapApiKey();
const repository = new PostgresGatewayRepository(databaseUrl);
await repository.migrate();
await repository.bootstrapProject(
  process.env["GATEWAY_PROJECT_NAME"] ?? "Local development",
  bootstrapKey
);

const app = await buildGateway({
  repository,
  providers: configuredProviders(),
  messagingProviders: configuredMessagingProviders(),
  country: process.env["AFRICA_COUNTRY"] ?? "NG",
  logger: true
});
const port = Number(process.env["PORT"] ?? "4010");
await app.listen({ host: "0.0.0.0", port });

function configuredProviders(): PaymentProvider[] {
  const configured = (process.env["PAYMENT_PROVIDERS"] ?? "mock")
    .split(",")
    .map((value) => value.trim());
  return configured.map((id) => {
    if (id === "mock") return new MockPaymentProvider();
    if (id === "paystack")
      return new PaystackPaymentProvider({ secretKey: requiredEnvironment("PAYSTACK_SECRET_KEY") });
    if (id === "flutterwave")
      return new FlutterwavePaymentProvider({
        secretKey: requiredEnvironment("FLW_SECRET_KEY"),
        webhookSecret: requiredEnvironment("FLW_WEBHOOK_SECRET")
      });
    throw new ConfigurationError(`Unknown configured payment provider '${id}'`);
  });
}
function configuredMessagingProviders(): MessagingProvider[] {
  const configured = (process.env["MESSAGING_PROVIDERS"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.map((id) => {
    if (id === "termii")
      return new TermiiMessagingProvider({
        apiKey: requiredEnvironment("TERMII_API_KEY"),
        baseUrl: requiredEnvironment("TERMII_BASE_URL")
      });
    if (id === "africastalking")
      return new AfricasTalkingMessagingProvider({
        apiKey: requiredEnvironment("AFRICASTALKING_API_KEY"),
        username: requiredEnvironment("AFRICASTALKING_USERNAME")
      });
    throw new ConfigurationError(`Unknown configured messaging provider '${id}'`);
  });
}
function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigurationError(`Required environment variable '${name}' is missing`);
  return value;
}
function bootstrapApiKey(): string {
  const configured = process.env["GATEWAY_BOOTSTRAP_API_KEY"];
  if (configured) return configured;
  if (process.env["NODE_ENV"] === "production")
    throw new ConfigurationError("GATEWAY_BOOTSTRAP_API_KEY is required in production");
  return "afd_test_local_development_key_change_me";
}
