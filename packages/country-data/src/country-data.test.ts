import { describe, expect, it } from "vitest";
import { capabilities, countries, currencies } from "./index.js";

describe("country registry", () => {
  it("returns only implemented Nigeria payment providers", () => {
    expect(
      capabilities({ country: "NG", service: "payments" }).map(({ provider }) => provider)
    ).toEqual(["paystack", "flutterwave"]);
  });

  it("does not present planned support as usable", () => {
    expect(capabilities({ country: "KE", service: "mobile_money" })).toEqual([]);
  });

  it("records zero-decimal currencies explicitly", () => {
    expect(currencies.UGX.exponent).toBe(0);
    expect(countries.NG.currencies).toEqual(["NGN"]);
  });
});
