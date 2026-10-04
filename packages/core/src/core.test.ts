import { describe, expect, it } from "vitest";
import {
  EnvironmentSecretProvider,
  ProviderRegistry,
  env,
  redactLogValue,
  redactSecrets,
  serializeErrorForLog
} from "./index.js";

describe("core security and registry", () => {
  it("keeps environment references symbolic", () => {
    expect(env("PAYSTACK_SECRET_KEY")).toEqual({
      kind: "environment",
      name: "PAYSTACK_SECRET_KEY"
    });
  });

  it("resolves secrets without including values in errors", async () => {
    const provider = new EnvironmentSecretProvider({});
    await expect(provider.get("PAYSTACK_SECRET_KEY")).rejects.not.toThrow(/sk_live/);
  });

  it("redacts known credential shapes", () => {
    expect(redactSecrets("Bearer abc.def and sk_test_123456")).toBe("[REDACTED] and [REDACTED]");
  });

  it("redacts sensitive log fields recursively", () => {
    expect(
      redactLogValue({
        authorization: "Bearer super-secret",
        provider: { apiKey: "termii-secret", nested: { token: "token" } },
        message: "sk_live_abcdef"
      })
    ).toEqual({
      authorization: "[REDACTED]",
      provider: { apiKey: "[REDACTED]", nested: { token: "[REDACTED]" } },
      message: "[REDACTED]"
    });
  });

  it("does not serialize credential-shaped errors verbatim", () => {
    const error = new Error("Provider returned FLWSECK_TEST-super-secret");
    expect(JSON.stringify(serializeErrorForLog(error))).not.toContain("super-secret");
  });

  it("filters registered providers by capability", () => {
    const registry = new ProviderRegistry();
    registry.register({
      id: "example",
      name: "Example",
      category: "payments",
      countries: ["NG"],
      capabilities: ["payment.create"],
      environments: ["test"],
      documentationUrl: "https://example.com/docs",
      verifiedAt: "2026-10-04"
    });
    expect(registry.list({ country: "NG", capability: "payment.create" })).toHaveLength(1);
  });
});
