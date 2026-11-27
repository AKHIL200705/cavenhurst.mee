import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, meta } from "@/components/site/InfoPage";

export const Route = createFileRoute("/shipping-returns")({
  head: () =>
    meta(
      "Shipping, Return & Refund Policy",
      "CAVENHUSRT India shipping policy (free above ₹1,999, flat ₹99 below, 3–7 business days), 7-day return & exchange policy, and 5–7 day refund timeline.",
      { path: "/shipping-returns" },
    ),
  component: () => (
    <InfoPage eyebrow="SUPPORT" title="Shipping & Returns">
      <h2>Shipping</h2>
      <p>
        We deliver across India. Free shipping on orders above ₹1,999; a flat ₹99 fee applies below
        that. Most orders arrive within 3–7 business days.
      </p>
      <h2>Returns & exchanges</h2>
      <p>
        Return or exchange unworn items with original tags within 7 days of delivery. Refunds are
        processed to the original payment method within 5–7 business days of pickup.
      </p>
    </InfoPage>
  ),
});
