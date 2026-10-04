import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@africa-dev/core": `${root}packages/core/src/index.ts`,
      "@africa-dev/country-data": `${root}packages/country-data/src/index.ts`,
      "@africa-dev/payments-core": `${root}packages/payments-core/src/index.ts`,
      "@africa-dev/messaging-core": `${root}packages/messaging-core/src/index.ts`,
      "@africa-dev/provider-termii": `${root}packages/provider-termii/src/index.ts`,
      "@africa-dev/provider-africastalking": `${root}packages/provider-africastalking/src/index.ts`,
      "@africa-dev/testkit": `${root}packages/testkit/src/index.ts`,
      "@africa-dev/provider-paystack": `${root}packages/provider-paystack/src/index.ts`,
      "@africa-dev/provider-flutterwave": `${root}packages/provider-flutterwave/src/index.ts`,
      "@africa-dev/sdk": `${root}packages/sdk/src/index.ts`
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: { reporter: ["text", "json", "html"] }
  }
});
