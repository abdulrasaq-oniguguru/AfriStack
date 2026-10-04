import { describe, expect, it } from "vitest";
import { majorToMinor, minorToMajor } from "./money.js";

describe("money conversion", () => {
  it("converts two-decimal currencies without floating point", () => {
    expect(minorToMajor("5001", "NGN")).toBe("50.01");
    expect(majorToMinor("50.01", "NGN")).toBe("5001");
  });

  it("supports zero-decimal currencies", () => {
    expect(minorToMajor("5001", "UGX")).toBe("5001");
    expect(majorToMinor("5001", "UGX")).toBe("5001");
  });

  it("rejects excess precision", () => {
    expect(() => majorToMinor("1.001", "NGN")).toThrow(/at most 2/);
  });
});
