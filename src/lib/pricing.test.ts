import { describe, expect, it } from "vitest";
import {
  calculateOrderPricingPaise,
  computeTotals,
  fromPaise,
  toPaise,
  type CouponPricingRule,
} from "./pricing";

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

describe("integer-paise checkout pricing engine", () => {
  it("converts INR to paise and back without floating-point drift", () => {
    expect(toPaise(879)).toBe(87900);
    expect(fromPaise(87900)).toBe(879);
    expect(toPaise(1999.99)).toBe(199999);
  });

  it("computes direct Buy Now single item independently of cart", () => {
    const direct = calculateOrderPricingPaise({
      items: [{ price: 879, qty: 1 }],
      couponCode: null,
    });
    expect(direct.subtotal).toBe(879);
    expect(direct.discount).toBe(0);
    expect(direct.shipping).toBe(99);
    expect(direct.total).toBe(978);
    expect(direct.totalPaise).toBe(97800);
    expect(direct.totalPaise).toBe(direct.total * 100);
  });

  it("enforces coupon minimum order value and shipping threshold after discount", () => {
    const rule: CouponPricingRule = {
      code: "CAVEN10",
      discountType: "percentage",
      discountValue: 10,
      minOrderValue: 1500,
    };

    const belowMin = calculateOrderPricingPaise({
      items: [{ price: 879, qty: 1 }],
      couponCode: "CAVEN10",
      couponRule: rule,
    });
    expect(belowMin.discount).toBe(0);
    expect(belowMin.appliedCouponCode).toBeNull();
    expect(belowMin.couponRejectionReason).toMatch(/1,500/);

    const dropsBelowFreeShip = calculateOrderPricingPaise({
      items: [{ price: 2000, qty: 1 }],
      couponCode: "CAVEN10",
      couponRule: rule,
    });
    expect(dropsBelowFreeShip.discount).toBe(200);
    expect(dropsBelowFreeShip.shipping).toBe(99);
    expect(dropsBelowFreeShip.total).toBe(1899);
    expect(dropsBelowFreeShip.totalPaise).toBe(189900);

    const qualifiesFreeShip = calculateOrderPricingPaise({
      items: [{ price: 749, qty: 3 }],
      couponCode: "CAVEN10",
      couponRule: rule,
    });
    expect(qualifiesFreeShip.subtotal).toBe(2247);
    expect(qualifiesFreeShip.discount).toBe(225);
    expect(qualifiesFreeShip.shipping).toBe(0);
    expect(qualifiesFreeShip.total).toBe(2022);
    expect(qualifiesFreeShip.totalPaise).toBe(202200);
  });

  it("caps percentage discounts by maxDiscount and handles fixed coupons cleanly", () => {
    const capped = calculateOrderPricingPaise({
      items: [{ price: 5000, qty: 1 }],
      couponCode: "VIP50",
      couponRule: {
        code: "VIP50",
        discountType: "percentage",
        discountValue: 50,
        maxDiscount: 600,
      },
    });
    expect(capped.discount).toBe(600);
    expect(capped.shipping).toBe(0);
    expect(capped.total).toBe(4400);

    const fixed = calculateOrderPricingPaise({
      items: [{ price: 1200, qty: 1 }],
      couponCode: "FLAT300",
      couponRule: {
        code: "FLAT300",
        discountType: "fixed",
        discountValue: 300,
      },
    });
    expect(fixed.discount).toBe(300);
    expect(fixed.shipping).toBe(99);
    expect(fixed.total).toBe(999);
  });
});
