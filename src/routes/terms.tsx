import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, meta } from "@/components/site/InfoPage";

export const Route = createFileRoute("/terms")({
  head: () => meta("Terms and Conditions", "Terms of use for shopping at CAVENHUSRT."),
  component: () => (
    <InfoPage eyebrow="LEGAL" title="Terms & Conditions">
      <p>
        By using this website you agree to these terms. All prices are in Indian Rupees and
        inclusive of taxes. Product availability and prices may change without notice.
      </p>
      <p>
        Orders are confirmed only after successful payment verification. CAVENHUSRT reserves the
        right to cancel orders in case of pricing errors or stock unavailability, with a full
        refund.
      </p>
    </InfoPage>
  ),
});
