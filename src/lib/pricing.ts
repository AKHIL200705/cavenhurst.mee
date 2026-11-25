export const FREE_SHIPPING_THRESHOLD = 1999;
export const SHIPPING_FEE = 99;
export const FREE_SHIPPING_THRESHOLD_PAISE = FREE_SHIPPING_THRESHOLD * 100;
export const SHIPPING_FEE_PAISE = SHIPPING_FEE * 100;

export interface CouponPricingRule {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderValue?: number | null | undefined;
  maxDiscount?: number | null | undefined;
  label?: string | undefined;
}

export const COUPONS: Record<string, { percent: number; label: string; minOrderValue?: number }> = {
  CAVEN10: { percent: 10, label: "10% off orders ₹1,500+", minOrderValue: 1500 },
};

export interface PricedLineItem {
  price: number;
  qty: number;
}

export interface OrderPricingBreakdown {
  subtotalPaise: number;
  discountPaise: number;
  afterDiscountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  subtotal: number;
  discount: number;
  shipping: number;
  codFee: number;
  taxes: number;
  total: number;
  appliedCouponCode: string | null;
  couponRejectionReason: string | null;
}

/** Converts INR rupees to integer paise without floating-point drift. */
export function toPaise(rupees: number): number {
  const safe = Number(rupees);
  if (!Number.isFinite(safe) || safe <= 0) return 0;
  return Math.round(safe * 100);
}

/** Converts integer paise back to whole INR rupees matching persisted integer totals. */
export function fromPaise(paise: number): number {
  const safe = Number(paise);
  if (!Number.isFinite(safe) || safe <= 0) return 0;
  return Math.round(safe / 100);
}

/**
 * Single integer-paise pricing calculator shared by cart, direct Buy Now checkout,
 * server-side order verification, and Razorpay payment initialization.
 */
export function calculateOrderPricingPaise(params: {
  items?: ReadonlyArray<PricedLineItem> | undefined;
  subtotalRupees?: number | undefined;
  couponCode?: string | null | undefined;
  couponRule?: CouponPricingRule | null | undefined;
  codFeeRupees?: number | undefined;
  taxRateBps?: number | undefined;
}): OrderPricingBreakdown {
  const rawSubtotalPaise = params.items
    ? params.items.reduce((sum, item) => {
        const unitPaise = toPaise(item.price);
        const qty = Math.max(0, Math.floor(Number(item.qty) || 0));
        return sum + unitPaise * qty;
      }, 0)
    : toPaise(params.subtotalRupees ?? 0);

  // Align subtotal to whole INR paise multiples so DB integer columns match paise / 100 1:1.
  const subtotalPaise = Math.round(rawSubtotalPaise / 100) * 100;
  const subtotal = fromPaise(subtotalPaise);

  let discountPaise = 0;
  let appliedCouponCode: string | null = null;
  let couponRejectionReason: string | null = null;

  const normalizedCode = params.couponCode?.trim().toUpperCase() || null;
  if (normalizedCode && subtotalPaise > 0) {
    const fallbackCoupon = COUPONS[normalizedCode];
    const resolvedRule: CouponPricingRule | null =
      params.couponRule && params.couponRule.code.toUpperCase() === normalizedCode
        ? params.couponRule
        : fallbackCoupon
          ? {
              code: normalizedCode,
              discountType: "percentage",
              discountValue: fallbackCoupon.percent,
              minOrderValue: fallbackCoupon.minOrderValue ?? null,
              label: fallbackCoupon.label,
            }
          : null;

    if (!resolvedRule) {
      couponRejectionReason = `Coupon code "${normalizedCode}" is invalid or expired.`;
    } else {
      const minOrderPaise = toPaise(resolvedRule.minOrderValue ?? 0);
      if (minOrderPaise > 0 && subtotalPaise < minOrderPaise) {
        couponRejectionReason = `Minimum order of ${formatINR(fromPaise(minOrderPaise))} required for ${resolvedRule.code}.`;
      } else {
        const computedPaise =
          resolvedRule.discountType === "percentage"
            ? Math.round((subtotalPaise * resolvedRule.discountValue) / 100)
            : toPaise(resolvedRule.discountValue);
        const maxDiscountPaise =
          resolvedRule.maxDiscount != null && resolvedRule.maxDiscount > 0
            ? toPaise(resolvedRule.maxDiscount)
            : computedPaise;
        const cappedPaise = Math.min(subtotalPaise, computedPaise, maxDiscountPaise);
        discountPaise = Math.min(subtotalPaise, Math.round(cappedPaise / 100) * 100);
        appliedCouponCode = resolvedRule.code.toUpperCase();
      }
    }
  }

  const afterDiscountPaise = Math.max(0, subtotalPaise - discountPaise);
  const shippingPaise =
    subtotalPaise === 0 || afterDiscountPaise >= FREE_SHIPPING_THRESHOLD_PAISE
      ? 0
      : SHIPPING_FEE_PAISE;
  const codFeePaise =
    subtotalPaise === 0 ? 0 : Math.round(toPaise(params.codFeeRupees ?? 0) / 100) * 100;
  const taxRateBps = Math.max(0, Math.floor(Number(params.taxRateBps) || 0));
  const rawTaxPaise = taxRateBps > 0 ? Math.round((afterDiscountPaise * taxRateBps) / 10000) : 0;
  const taxPaise = Math.round(rawTaxPaise / 100) * 100;
  const totalPaise = Math.max(0, afterDiscountPaise + shippingPaise + codFeePaise + taxPaise);

  return {
    subtotalPaise,
    discountPaise,
    afterDiscountPaise,
    shippingPaise,
    codFeePaise,
    taxPaise,
    totalPaise,
    subtotal,
    discount: fromPaise(discountPaise),
    shipping: fromPaise(shippingPaise),
    codFee: fromPaise(codFeePaise),
    taxes: fromPaise(taxPaise),
    total: fromPaise(totalPaise),
    appliedCouponCode,
    couponRejectionReason,
  };
}

export function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function discountPercent(price: number, mrp: number) {
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

export function computeTotals(subtotal: number, couponCode?: string | null) {
  const coupon = couponCode ? COUPONS[couponCode.toUpperCase()] : undefined;
  const discount = coupon ? Math.round((subtotal * coupon.percent) / 100) : 0;
  const afterDiscount = subtotal - discount;
  const shipping = subtotal === 0 || afterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return { subtotal, discount, shipping, total: afterDiscount + shipping };
}
