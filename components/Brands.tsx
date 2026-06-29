import { Section } from "./Section";
import { ArrowRight } from "./icons";
import OfferCtaLink from "@/components/OfferCtaLink";

const brands = [
  "Toyota", "Honda", "Ford", "Chevrolet", "GMC", "Ram", "Jeep", "Dodge",
  "Nissan", "Hyundai", "Kia", "Mazda", "Subaru", "Volkswagen", "BMW",
  "Mercedes-Benz", "Audi", "Lexus", "Acura", "Tesla", "Cadillac", "Volvo",
  "Porsche", "Land Rover", "Chrysler", "Buick", "Mitsubishi", "Genesis",
];

export default function Brands() {
  return (
    <Section className="bg-white">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="eyebrow">Brands We Buy</p>
          <h2 className="h-section mt-2">Every make, every model</h2>
          <p className="mt-4 text-lg text-muted">
            Cars, trucks, SUVs and vans — financed, leased, or paid off. If it has
            four wheels, we want to make you an offer.
          </p>
          <OfferCtaLink
            location="brands"
            className="mt-6 inline-flex items-center gap-2 font-semibold text-brand hover:gap-3"
          >
            Don&apos;t see yours? We still want it <ArrowRight className="h-4 w-4" />
          </OfferCtaLink>
        </div>

        <div className="card-outline p-7 sm:p-8">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3.5">
            {[...brands].sort((a, b) => a.localeCompare(b)).map((b) => (
              <OfferCtaLink
                key={b}
                location="brands"
                className="font-display text-lg font-semibold text-navy/55 transition hover:text-brand sm:text-xl"
              >
                {b}
              </OfferCtaLink>
            ))}
            <span className="font-display text-lg font-semibold text-accent-700 sm:text-xl">
              + more
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}
