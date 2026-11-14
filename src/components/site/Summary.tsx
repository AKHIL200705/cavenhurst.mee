import { computeTotals, formatINR } from "@/lib/pricing";
import { useStore } from "@/lib/store";

export function Summary() {
  const { subtotal, coupon } = useStore();
  const t = computeTotals(subtotal, coupon);
  return (
    <div className="space-y-2 text-sm">
      <Row l="Subtotal" v={formatINR(t.subtotal)} />
      {t.discount > 0 && <Row l={`Discount (${coupon})`} v={`− ${formatINR(t.discount)}`} />}
      <Row l="Shipping" v={t.shipping ? formatINR(t.shipping) : "Free"} />
      <div className="my-3 h-px bg-border" />
      <Row l="Total" v={formatINR(t.total)} bold />
    </div>
  );
}
const Row = ({ l, v, bold }: { l: string; v: string; bold?: boolean }) => (
  <div className={`flex justify-between ${bold ? "text-lg font-bold" : "text-muted-foreground"}`}>
    <span>{l}</span>
    <span className={bold ? "" : "text-foreground"}>{v}</span>
  </div>
);
