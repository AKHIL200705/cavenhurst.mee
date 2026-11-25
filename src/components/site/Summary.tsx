import {
  calculateOrderPricingPaise,
  formatINR,
  type CouponPricingRule,
  type PricedLineItem,
} from "@/lib/pricing";
import { useStore } from "@/lib/store";

export interface SummaryProps {
  items?: ReadonlyArray<PricedLineItem> | undefined;
  subtotalOverride?: number | undefined;
  couponCodeOverride?: string | null | undefined;
  couponRuleOverride?: CouponPricingRule | null | undefined;
  codFeeRupees?: number | undefined;
  taxRateBps?: number | undefined;
}

export function Summary({
  items,
  subtotalOverride,
  couponCodeOverride,
  couponRuleOverride,
  codFeeRupees,
  taxRateBps,
}: SummaryProps = {}) {
  const { subtotal: storeSubtotal, coupon: storeCoupon } = useStore();
  const hasExplicitTotals = items !== undefined || subtotalOverride !== undefined;
  const effectiveCoupon = hasExplicitTotals
    ? (couponCodeOverride ?? null)
    : (couponCodeOverride ?? storeCoupon);
  const t = calculateOrderPricingPaise({
    items,
    subtotalRupees: hasExplicitTotals ? subtotalOverride : storeSubtotal,
    couponCode: effectiveCoupon,
    couponRule: couponRuleOverride,
    codFeeRupees,
    taxRateBps,
  });

  return (
    <div className="space-y-2.5 text-sm">
      <Row l="Subtotal" v={formatINR(t.subtotal)} />
      {t.discount > 0 && (
        <Row
          l={`Discount${t.appliedCouponCode ? ` (${t.appliedCouponCode})` : ""}`}
          v={`− ${formatINR(t.discount)}`}
          highlight
        />
      )}
      {t.couponRejectionReason && effectiveCoupon && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200">
          {t.couponRejectionReason}
        </p>
      )}
      <Row l="Shipping" v={t.shipping ? formatINR(t.shipping) : "Free"} />
      {t.codFee > 0 && <Row l="Cash on Delivery Fee" v={formatINR(t.codFee)} />}
      {t.taxes > 0 && <Row l="Taxes (GST)" v={formatINR(t.taxes)} />}
      <div className="my-3 h-px bg-border" />
      <Row l="Total" v={formatINR(t.total)} bold />
    </div>
  );
}

const Row = ({
  l,
  v,
  bold,
  highlight,
}: {
  l: string;
  v: string;
  bold?: boolean;
  highlight?: boolean;
}) => (
  <div
    className={`flex justify-between ${
      bold ? "text-lg font-bold text-foreground" : "text-muted-foreground"
    }`}
  >
    <span>{l}</span>
    <span className={bold ? "" : highlight ? "font-semibold text-gold" : "text-foreground"}>
      {v}
    </span>
  </div>
);
