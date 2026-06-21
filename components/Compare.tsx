import { Section } from "./Section";
import { Check, X } from "./icons";
import Carousel from "./Carousel";

const us = [
  "Firm price — no haggling",
  "Paid the same day, by bank draft",
  "We come to you, free",
  "No fees, no obligation",
];

const dealership = [
  "Lowball trade-in value",
  "Long appraisals and waiting",
  "Payment can be delayed",
  "Pressure to buy a car",
];

const privateSale = [
  "Lowball and tire-kicker offers",
  "Endless messages and no-shows",
  "You handle all the paperwork",
  "Safety risk meeting strangers",
];

function Column({
  title,
  items,
  highlight = false,
  className = "",
}: {
  title: string;
  items: readonly string[];
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl ${
        highlight
          ? "border-2 border-brand bg-white shadow-lift wide:-mt-4"
          : "border border-slate-200 bg-white"
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-7 py-6">
        {highlight ? (
          <span className="font-logo text-xl font-extrabold tracking-tight text-navy">
            Drive<span className="text-brand-700">Offer</span>
          </span>
        ) : (
          <h3 className="font-display text-xl font-bold text-navy">{title}</h3>
        )}
        {highlight && (
          <span className="shrink-0 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-700">
            Best choice
          </span>
        )}
      </div>
      <ul>
        {items.map((it, i) => {
          // Zebra striping — odd rows (1st, 3rd) are the darker grey.
          const darker = i % 2 === 0;
          const rowBg = darker ? "bg-slate-50" : "bg-white";
          return (
            <li
              key={it}
              className={`flex items-center gap-3 px-6 py-7 text-base ${rowBg} ${
                highlight ? "font-medium text-navy" : "text-muted"
              }`}
            >
              {highlight ? (
                <Check className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <X className="h-5 w-5 shrink-0 text-slate-400" />
              )}
              {it}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Compare() {
  return (
    <Section className="bg-white">
      <div className="mx-auto max-w-col wide:max-w-none">
        <h2 className="h-section">
          Why sell your car online to DriveOffer?
        </h2>
        <Carousel
          className="mt-12"
          trackClassName="items-start gap-6 wide:grid wide:grid-cols-3 wide:overflow-visible wide:cursor-default"
          controlsClassName="wide:hidden"
        >
          <Column title="Dealership trade-in" items={dealership} className="w-full shrink-0 snap-start snap-always wide:w-auto" />
          <Column title="DriveOffer" items={us} highlight className="order-first w-full shrink-0 snap-start snap-always wide:order-none wide:w-auto" />
          <Column title="Private sale" items={privateSale} className="w-full shrink-0 snap-start snap-always wide:w-auto" />
        </Carousel>
      </div>
    </Section>
  );
}
