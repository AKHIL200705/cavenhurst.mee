import { describe, expect, it } from "vitest";
import { computeTotals } from "./pricing";

describe("cart totals", () => {
  it("ships free on orders of ₹1,999 or more", () => {
    expect(computeTotals(1999).shipping).toBe(0);
  });
  it("charges shipping below ₹1,999", () => {
    expect(computeTotals(1099).shipping).toBe(99);
  });
  it("applies CAVEN10 as 10% off", () => {
    expect(computeTotals(2000, "caven10").discount).toBe(200);
  });
});
