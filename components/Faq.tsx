import { Section, SectionHeading } from "./Section";
import { ChevronDown } from "./icons";
import { site } from "@/lib/site-config";

const faqs = [
  {
    q: "How much does it cost to get an offer?",
    a: "Nothing. Getting an offer is completely free with no obligation to sell. You only sell if you're happy with the number.",
  },
  {
    q: "How do you decide on a price?",
    a: "We look at recent local sales and listings for your exact year, make, model, trim and mileage, then adjust for condition. The online number is an estimated range; we confirm a firm offer by phone or email.",
  },
  {
    q: "How and when do I get paid?",
    a: "The same day, by Interac e-transfer or bank draft — sent before we take the keys. No cash, no waiting on a cheque to clear.",
  },
  {
    q: "Do I have to bring my car anywhere?",
    a: "No. Once you accept, we book a time and place that works for you and send a specialist out to inspect the vehicle. We come to you.",
  },
  {
    q: "Can I sell a car that isn't paid off?",
    a: "Yes. We pay your bank or lease company directly for the payout amount and send you the difference. Just bring your most recent statement.",
  },
  {
    q: "What if my firm offer is lower than the online estimate?",
    a: "It can happen if the car's condition differs from what you entered. We'll show you exactly which items changed the number — and you're free to walk away, no pressure.",
  },
  {
    q: "What if my vehicle isn't listed online?",
    a: `No problem — some cars are best priced by a person. Give us a call at ${site.phoneDisplay} or submit your info and a specialist will follow up with a custom offer.`,
  },
];

export default function Faq() {
  return (
    <Section className="bg-cream">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions? We've got answers"
          subtitle="Still not sure about something? Call us any time — a real person will pick up."
        />
        <div className="space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="card group overflow-hidden p-0 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 p-5 font-semibold text-navy">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-brand transition duration-300 group-open:rotate-180" />
              </summary>
              <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-open:grid-rows-[1fr]">
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-muted">{f.a}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
