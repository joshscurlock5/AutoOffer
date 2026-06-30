import { Section } from "./Section";
import { ArrowRight, Phone } from "./icons";
import OfferCtaLink from "@/components/OfferCtaLink";
import TelLink from "@/components/TelLink";

export default function FinalCTA() {
  return (
    <Section className="bg-cream">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="h-section">Ready for your free offer?</h2>
        <p className="mt-3 text-lg text-muted">
          Free and no obligation — a specialist will get back to you.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <OfferCtaLink location="final_cta" className="btn-primary px-8 py-4 text-lg">
            Get a Free Offer
            <ArrowRight className="h-5 w-5" />
          </OfferCtaLink>
          <TelLink
            location="final_cta"
            className="btn border-2 border-brand-600 bg-white px-8 py-4 text-lg text-brand-700 transition hover:-translate-y-0.5 hover:bg-brand-50"
          >
            <Phone className="h-5 w-5" /> Call to get your offer
          </TelLink>
        </div>
      </div>
    </Section>
  );
}
