import { ConfigurationError } from "./errors.js";

export interface SecretProvider {
  get(name: string): Promise<string>;
}

export class EnvironmentSecretProvider implements SecretProvider {
  constructor(private readonly environment: NodeJS.ProcessEnv = process.env) {}

  async get(name: string): Promise<string> {
    const value = this.environment[name];
    if (!value) {
      throw new ConfigurationError(`Required environment variable '${name}' is not configured`, {
        code: "MISSING_SECRET"
      });
    }
    return value;
  }
}

export type EnvironmentReference = Readonly<{ kind: "environment"; name: string }>;

export function env(name: string): EnvironmentReference {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new ConfigurationError(
      "Environment variable names must use uppercase letters, digits and underscores",
      {
        code: "INVALID_ENV_REFERENCE"
      }
    );
  }
  return Object.freeze({ kind: "environment", name });
}
