import { currencies, type SupportedCurrency } from "@africa-dev/country-data";
import { InvalidRequestError } from "@africa-dev/core";

const INTEGER = /^-?\d+$/;

export function assertMinorAmount(amountMinor: string): bigint {
  if (!INTEGER.test(amountMinor)) {
    throw new InvalidRequestError("amountMinor must be an integer string", {
      code: "INVALID_AMOUNT"
    });
  }
  const amount = BigInt(amountMinor);
  if (amount <= 0n) {
    throw new InvalidRequestError("amountMinor must be greater than zero", {
      code: "INVALID_AMOUNT"
    });
  }
  return amount;
}

export function minorToMajor(amountMinor: string, currency: SupportedCurrency): string {
  const amount = assertMinorAmount(amountMinor);
  const exponent = currencies[currency].exponent;
  if (exponent === 0) return amount.toString();
  const factor = 10n ** BigInt(exponent);
  const whole = amount / factor;
  const fraction = (amount % factor).toString().padStart(exponent, "0");
  return `${whole.toString()}.${fraction}`;
}

export function majorToMinor(amountMajor: string, currency: SupportedCurrency): string {
  if (!/^\d+(?:\.\d+)?$/.test(amountMajor)) {
    throw new InvalidRequestError("Major amount must be a positive decimal string", {
      code: "INVALID_AMOUNT"
    });
  }
  const exponent = currencies[currency].exponent;
  const [whole = "0", fraction = ""] = amountMajor.split(".");
  if (fraction.length > exponent) {
    throw new InvalidRequestError(
      `Currency ${currency} supports at most ${exponent.toString()} decimal places`,
      {
        code: "INVALID_AMOUNT_PRECISION"
      }
    );
  }
  return (
    BigInt(whole) * 10n ** BigInt(exponent) +
    BigInt((fraction || "0").padEnd(exponent, "0"))
  ).toString();
}
