import type { SupportLevel } from "@africa-dev/core";
import { z } from "zod";

export const currencyMetadataSchema = z.object({
  code: z.string().length(3),
  exponent: z.number().int().min(0).max(6),
  name: z.string().min(1)
});
export type CurrencyMetadata = z.infer<typeof currencyMetadataSchema>;

export const currencies = {
  NGN: { code: "NGN", exponent: 2, name: "Nigerian naira" },
  GHS: { code: "GHS", exponent: 2, name: "Ghanaian cedi" },
  KES: { code: "KES", exponent: 2, name: "Kenyan shilling" },
  ZAR: { code: "ZAR", exponent: 2, name: "South African rand" },
  UGX: { code: "UGX", exponent: 0, name: "Ugandan shilling" },
  TZS: { code: "TZS", exponent: 2, name: "Tanzanian shilling" },
  RWF: { code: "RWF", exponent: 0, name: "Rwandan franc" },
  XOF: { code: "XOF", exponent: 0, name: "West African CFA franc" },
  XAF: { code: "XAF", exponent: 0, name: "Central African CFA franc" },
  USD: { code: "USD", exponent: 2, name: "United States dollar" }
} as const satisfies Record<string, CurrencyMetadata>;

export type SupportedCurrency = keyof typeof currencies;

export type ProviderCountrySupport = {
  provider: string;
  category: "payments" | "messaging" | "identity" | "mobile_money";
  level: SupportLevel;
  capabilities: string[];
  sourceUrl: string;
  verifiedAt: string;
};

export type CountryProfile = {
  countryCode: string;
  name: string;
  currencies: SupportedCurrency[];
  callingCode: string;
  timezones: string[];
  languages: string[];
  providerSupport: ProviderCountrySupport[];
};

const planned = (
  provider: string,
  category: ProviderCountrySupport["category"]
): ProviderCountrySupport => ({
  provider,
  category,
  level: "planned",
  capabilities: [],
  sourceUrl: "https://github.com/africa-dev-infra/africa-dev-infra/blob/main/ROADMAP.md",
  verifiedAt: "2026-10-04"
});

export const countries = {
  NG: {
    countryCode: "NG",
    name: "Nigeria",
    currencies: ["NGN"],
    callingCode: "+234",
    timezones: ["Africa/Lagos"],
    languages: ["en"],
    providerSupport: [
      {
        provider: "paystack",
        category: "payments",
        level: "supported",
        capabilities: [
          "payment.create",
          "payment.verify",
          "payment.get",
          "payment.refund",
          "webhook.verify"
        ],
        sourceUrl: "https://paystack.com/docs/payments/accept-payments/",
        verifiedAt: "2026-10-04"
      },
      {
        provider: "flutterwave",
        category: "payments",
        level: "supported",
        capabilities: [
          "payment.create",
          "payment.verify",
          "payment.get",
          "payment.refund",
          "webhook.verify"
        ],
        sourceUrl: "https://developer.flutterwave.com/docs/flutterwave-standard-1",
        verifiedAt: "2026-10-04"
      },
      {
        provider: "termii",
        category: "messaging",
        level: "supported",
        capabilities: ["messaging.sendSms", "messaging.sendOtp", "messaging.verifyOtp"],
        sourceUrl: "https://developers.termii.com/messaging-api",
        verifiedAt: "2026-10-04"
      }
    ]
  },
  GH: {
    countryCode: "GH",
    name: "Ghana",
    currencies: ["GHS"],
    callingCode: "+233",
    timezones: ["Africa/Accra"],
    languages: ["en"],
    providerSupport: [planned("payments", "payments")]
  },
  KE: {
    countryCode: "KE",
    name: "Kenya",
    currencies: ["KES"],
    callingCode: "+254",
    timezones: ["Africa/Nairobi"],
    languages: ["en", "sw"],
    providerSupport: [planned("mpesa", "mobile_money")]
  },
  ZA: {
    countryCode: "ZA",
    name: "South Africa",
    currencies: ["ZAR"],
    callingCode: "+27",
    timezones: ["Africa/Johannesburg"],
    languages: ["en"],
    providerSupport: [planned("payments", "payments")]
  },
  UG: {
    countryCode: "UG",
    name: "Uganda",
    currencies: ["UGX"],
    callingCode: "+256",
    timezones: ["Africa/Kampala"],
    languages: ["en", "sw"],
    providerSupport: [planned("mobile-money", "mobile_money")]
  },
  TZ: {
    countryCode: "TZ",
    name: "Tanzania",
    currencies: ["TZS"],
    callingCode: "+255",
    timezones: ["Africa/Dar_es_Salaam"],
    languages: ["sw", "en"],
    providerSupport: [planned("mobile-money", "mobile_money")]
  },
  RW: {
    countryCode: "RW",
    name: "Rwanda",
    currencies: ["RWF"],
    callingCode: "+250",
    timezones: ["Africa/Kigali"],
    languages: ["rw", "en", "fr", "sw"],
    providerSupport: [planned("mobile-money", "mobile_money")]
  }
} as const satisfies Record<string, CountryProfile>;

export type SupportedCountry = keyof typeof countries;

export function getCountry(code: string): CountryProfile | undefined {
  return countries[code as SupportedCountry];
}

export function capabilities(query: {
  country: string;
  service: ProviderCountrySupport["category"];
}): ProviderCountrySupport[] {
  return (getCountry(query.country)?.providerSupport ?? []).filter(
    (entry) =>
      entry.category === query.service && entry.level !== "planned" && entry.level !== "unknown"
  );
}
