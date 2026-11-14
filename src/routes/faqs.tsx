import { createFileRoute } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { InfoPage, meta } from "@/components/site/InfoPage";

const faqs: [string, string][] = [
  ["How long does delivery take?", "Orders are delivered across India in 3–7 business days."],
  ["Is shipping free?", "Yes, on orders above ₹1,999. Below that, a flat ₹99 applies."],
  [
    "What is your return policy?",
    "Easy 7-day returns and exchanges on unworn items with tags attached.",
  ],
  ["Do you offer Cash on Delivery?", "COD is available on eligible PIN codes."],
  [
    "How do I find my size?",
    "Use the size guide on each product page. Oversized styles are cut roomy — size down for a closer fit.",
  ],
];

export const Route = createFileRoute("/faqs")({
  head: () =>
    meta("FAQs", "Answers to common questions about CAVENHURST orders, shipping and returns."),
  component: () => (
    <InfoPage eyebrow="HELP" title="FAQs">
      <Accordion type="single" collapsible className="text-foreground">
        {faqs.map(([q, a]) => (
          <AccordionItem key={q} value={q}>
            <AccordionTrigger>{q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </InfoPage>
  ),
});
