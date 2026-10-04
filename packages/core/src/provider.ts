import { z } from "zod";
import { ConfigurationError } from "./errors.js";

export const providerCategorySchema = z.enum(["payments", "messaging", "identity", "mobile_money"]);
export type ProviderCategory = z.infer<typeof providerCategorySchema>;

export const supportLevelSchema = z.enum(["supported", "sandbox_only", "planned", "unknown"]);
export type SupportLevel = z.infer<typeof supportLevelSchema>;

export const providerMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: providerCategorySchema,
  countries: z.array(z.string().length(2)),
  capabilities: z.array(z.string().min(1)),
  environments: z.array(z.enum(["test", "live"])).min(1),
  documentationUrl: z.url(),
  verifiedAt: z.iso.date()
});
export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;

export class ProviderRegistry {
  readonly #providers = new Map<string, ProviderMetadata>();

  register(metadata: ProviderMetadata): void {
    const parsed = providerMetadataSchema.parse(metadata);
    if (this.#providers.has(parsed.id)) {
      throw new ConfigurationError(`Provider '${parsed.id}' is already registered`, {
        code: "DUPLICATE_PROVIDER"
      });
    }
    this.#providers.set(parsed.id, Object.freeze(parsed));
  }

  get(id: string): ProviderMetadata | undefined {
    return this.#providers.get(id);
  }

  list(
    filters: { country?: string; category?: ProviderCategory; capability?: string } = {}
  ): ProviderMetadata[] {
    return [...this.#providers.values()].filter(
      (provider) =>
        (!filters.country || provider.countries.includes(filters.country)) &&
        (!filters.category || provider.category === filters.category) &&
        (!filters.capability || provider.capabilities.includes(filters.capability))
    );
  }
}
