import { createFileRoute } from "@tanstack/react-router";
import { InfoPage, meta } from "@/components/site/InfoPage";

export const Route = createFileRoute("/about")({
  head: () => meta("About CAVENHUSRT", "A unisex clothing brand rooted in simplicity."),
  component: () => (
    <InfoPage eyebrow="OUR STORY" title="Rooted in simplicity">
      <p>
        CAVENHUSRT is a premium Indian clothing brand creating modern, versatile and long-lasting
        wardrobe essentials for everyone.
      </p>
      <p>
        Every piece starts with fabric — heavyweight cottons, brushed fleece and considered finishes
        — and ends with a fit designed for real movement through the city.
      </p>
      <h2>What we stand for</h2>
      <p>Fewer, better pieces. Honest pricing. Clothing made to be worn on repeat.</p>
    </InfoPage>
  ),
});
