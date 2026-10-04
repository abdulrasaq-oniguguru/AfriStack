import { describe, expect, it } from "vitest";
import { renderConfig, renderEnvironmentExample } from "./index.js";

describe("CLI project generation", () => {
  it("generates executable provider configuration without secret values", () => {
    const config = renderConfig({ country: "NG", providers: ["mock", "paystack", "flutterwave"] });
    expect(config).toContain("new MockPaymentProvider()");
    expect(config).toContain('requiredEnv("PAYSTACK_SECRET_KEY")');
    expect(config).not.toMatch(/sk_(test|live)_/);
  });
  it("writes only empty secret placeholders", () => {
    expect(renderEnvironmentExample(["paystack", "flutterwave"])).toContain(
      "PAYSTACK_SECRET_KEY=\n"
    );
  });
});
