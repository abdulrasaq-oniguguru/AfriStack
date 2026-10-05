import { cp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const packages = [
  "cli",
  "core",
  "country-data",
  "messaging-core",
  "payments-core",
  "provider-africastalking",
  "provider-flutterwave",
  "provider-paystack",
  "provider-termii",
  "sdk",
  "testkit"
];

const source = join(repositoryRoot, "LICENSE");
await Promise.all(
  packages.map((name) => cp(source, join(repositoryRoot, "packages", name, "LICENSE")))
);

const license = await readFile(source, "utf8");
const mismatches = await Promise.all(
  packages.map(
    async (name) =>
      (await readFile(join(repositoryRoot, "packages", name, "LICENSE"), "utf8")) !== license
  )
);
if (mismatches.some(Boolean)) throw new Error("Package licenses do not match the root LICENSE");
