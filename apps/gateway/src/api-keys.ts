import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ConfigurationError } from "@africa-dev/core";

export type ApiKeyEnvironment = "test" | "live";
export type StoredApiKey = { prefix: string; hash: string };

export function generateApiKey(environment: ApiKeyEnvironment): { key: string } & StoredApiKey {
  const token = randomBytes(32).toString("base64url");
  const key = `afd_${environment}_${token}`;
  return { key, prefix: apiKeyPrefix(key), hash: hashApiKey(key) };
}

export function apiKeyPrefix(key: string): string {
  if (!/^afd_(test|live)_[A-Za-z0-9_-]{16,}$/.test(key)) {
    throw new ConfigurationError("Invalid gateway API key format", {
      code: "INVALID_API_KEY_FORMAT"
    });
  }
  return key.slice(0, 17);
}

export function hashApiKey(key: string, salt = randomBytes(16)): string {
  const digest = scryptSync(key, salt, 32);
  return `scrypt:${salt.toString("base64url")}:${digest.toString("base64url")}`;
}

export function verifyApiKey(key: string, encodedHash: string): boolean {
  const [algorithm, encodedSalt, encodedDigest] = encodedHash.split(":");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedDigest) return false;
  const expected = Buffer.from(encodedDigest, "base64url");
  const actual = scryptSync(key, Buffer.from(encodedSalt, "base64url"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
