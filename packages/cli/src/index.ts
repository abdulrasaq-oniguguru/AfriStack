#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { capabilities, countries } from "@africa-dev/country-data";
import { MockPaymentProvider } from "@africa-dev/testkit";

export type InitOptions = { country: string; providers: string[] };

export function renderConfig(options: InitOptions): string {
  const imports = [
    'import { Africa } from "@africa-dev/sdk";',
    ...(options.providers.includes("mock")
      ? ['import { MockPaymentProvider } from "@africa-dev/testkit";']
      : []),
    ...(options.providers.includes("paystack")
      ? ['import { PaystackPaymentProvider } from "@africa-dev/provider-paystack";']
      : []),
    ...(options.providers.includes("flutterwave")
      ? ['import { FlutterwavePaymentProvider } from "@africa-dev/provider-flutterwave";']
      : [])
  ];
  const factories = [
    ...(options.providers.includes("mock") ? ["new MockPaymentProvider()"] : []),
    ...(options.providers.includes("paystack")
      ? ['new PaystackPaymentProvider({ secretKey: requiredEnv("PAYSTACK_SECRET_KEY") })']
      : []),
    ...(options.providers.includes("flutterwave")
      ? [
          'new FlutterwavePaymentProvider({ secretKey: requiredEnv("FLW_SECRET_KEY"), webhookSecret: requiredEnv("FLW_WEBHOOK_SECRET") })'
        ]
      : [])
  ];
  return `${imports.join("\n")}\n\nexport function createAfrica() {\n  return new Africa({\n    country: ${JSON.stringify(options.country)},\n    payments: {\n      strategy: "priority",\n      providers: [\n        ${factories.join(",\n        ")}\n      ]\n    }\n  });\n}\n\nfunction requiredEnv(name: string): string {\n  const value = process.env[name];\n  if (!value) throw new Error(\`Required environment variable '\${name}' is missing\`);\n  return value;\n}\n`;
}

export function renderEnvironmentExample(providers: string[]): string {
  return (
    [
      "# Never commit real values. This file contains names and placeholders only.",
      ...(providers.includes("paystack") ? ["PAYSTACK_SECRET_KEY="] : []),
      ...(providers.includes("flutterwave") ? ["FLW_SECRET_KEY=", "FLW_WEBHOOK_SECRET="] : []),
      "DATABASE_URL=postgres://africa:africa@localhost:5432/africa_dev",
      "GATEWAY_BOOTSTRAP_API_KEY=afd_test_replace_with_a_long_random_value"
    ].join("\n") + "\n"
  );
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const [command] = argv;
  if (command === "init") return initCommand(argv.slice(1));
  if (command === "doctor") return doctorCommand();
  if (command === "providers") return providersCommand();
  if (command === "capabilities") return capabilitiesCommand(argv.slice(1));
  if (command === "test") return testCommand();
  if (command === "dev") return devCommand();
  stdout.write("Usage: africa-dev <init|doctor|providers|capabilities|test|dev>\n");
  return command ? 1 : 0;
}

async function initCommand(args: string[]): Promise<number> {
  const nonInteractive = args.includes("--yes");
  const force = args.includes("--force");
  let country = flag(args, "--country") ?? "NG";
  let providerList = (flag(args, "--providers") ?? "mock")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!nonInteractive) {
    const prompt = createInterface({ input: stdin, output: stdout });
    country =
      (await prompt.question(`Country code [${country}]: `)).trim().toUpperCase() || country;
    providerList = (
      (
        await prompt.question(`Payment providers (comma separated) [${providerList.join(",")}]: `)
      ).trim() || providerList.join(",")
    )
      .split(",")
      .map((value) => value.trim());
    prompt.close();
  }
  if (!(country in countries)) throw new Error(`Country '${country}' is not in the registry`);
  const supported = new Set(["mock", "paystack", "flutterwave"]);
  if (providerList.some((provider) => !supported.has(provider)))
    throw new Error("Only mock, paystack, and flutterwave are implemented payment providers");
  await writeNew("africa.config.ts", renderConfig({ country, providers: providerList }), force);
  await writeNew(".env.example", renderEnvironmentExample(providerList), force);
  stdout.write("Created africa.config.ts and .env.example. No secret values were written.\n");
  return 0;
}

async function doctorCommand(): Promise<number> {
  const checks = [
    ["Paystack key configured", Boolean(process.env["PAYSTACK_SECRET_KEY"])],
    ["Flutterwave key configured", Boolean(process.env["FLW_SECRET_KEY"])],
    ["Flutterwave webhook secret configured", Boolean(process.env["FLW_WEBHOOK_SECRET"])],
    ["PostgreSQL URL configured", Boolean(process.env["DATABASE_URL"])]
  ] as const;
  for (const [label, ok] of checks) stdout.write(`${ok ? "✓" : "✗"} ${label}\n`);
  stdout.write("Secrets were checked for presence only and were not printed.\n");
  return checks.every(([, ok]) => ok) ? 0 : 1;
}

function providersCommand(): number {
  stdout.write(
    "mock\tpayments\tNG\tmock-verified\npaystack\tpayments\tNG\tadapter-tested\nflutterwave\tpayments\tNG\tadapter-tested (sandbox certification pending)\n"
  );
  return 0;
}
function capabilitiesCommand(args: string[]): number {
  const country = flag(args, "--country") ?? "NG";
  stdout.write(`${JSON.stringify(capabilities({ country, service: "payments" }), null, 2)}\n`);
  return 0;
}
async function testCommand(): Promise<number> {
  const mock = new MockPaymentProvider();
  const payment = await mock.createPayment({
    amountMinor: "10000",
    currency: "NGN",
    customer: { email: "local@example.com" },
    reference: `CLI-${Date.now().toString()}`,
    idempotencyKey: `cli-${Date.now().toString()}`
  });
  stdout.write(`${JSON.stringify(payment, null, 2)}\n`);
  return 0;
}
async function devCommand(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["compose", "up", "--build"], {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    child.once("error", () => {
      stdout.write("Could not start Docker Compose. Ensure Docker is installed and running.\n");
      resolve(1);
    });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
async function writeNew(path: string, content: string, force: boolean): Promise<void> {
  if (!force) {
    try {
      await access(path, constants.F_OK);
      throw new Error(`${path} already exists; pass --force to replace it`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) throw error;
    }
  }
  await writeFile(path, content, { encoding: "utf8", flag: force ? "w" : "wx" });
}

const entrypoint = process.argv[1]
  ? await realpath(process.argv[1]).catch(() => process.argv[1])
  : undefined;
if (entrypoint === new URL(import.meta.url).pathname) {
  process.exitCode = await run();
}
