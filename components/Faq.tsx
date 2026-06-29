import { Section } from "./Section";
import { site } from "@/lib/site-config";
import ContactPopup from "./ContactPopup";
import FaqItem from "./FaqItem";

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
    a: "The same day, by bank draft — handed to you before we take the keys. A bank draft is guaranteed funds, so there's nothing to wait on (no cash, no cheque to clear).",
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
      <h2 className="h-section">FAQ</h2>
      <div className="mt-6 space-y-3">
        {faqs.map((f) => (
          <FaqItem key={f.q} q={f.q} a={f.a} />
        ))}
      </div>

      <ContactPopup />
    </Section>
  );
}
