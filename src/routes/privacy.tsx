import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, meta } from "@/components/site/InfoPage";

export const Route = createFileRoute("/privacy")({
  head: () => meta("Privacy Policy", "How CAVENHURST collects and protects your information."),
  component: () => (
    <InfoPage eyebrow="LEGAL" title="Privacy Policy">
      <p>
        We collect only the information needed to process your orders — name, contact details and
        shipping address. Payment details are handled by our payment partner and are never stored by
        us.
      </p>
      <p>
        We never sell your data. You can request access to or deletion of your information by
        contacting support@cavenhurst.in.
      </p>
    </InfoPage>
  ),
});
