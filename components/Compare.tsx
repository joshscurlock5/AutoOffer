import { Section } from "./Section";
import { Check, X } from "./icons";

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
      className={`${
        highlight
          ? "relative overflow-hidden rounded-2xl border-2 border-brand bg-white shadow-lift md:-mt-4"
          : "overflow-hidden rounded-2xl border border-slate-200 bg-white"
      } ${className}`}
    >
      <div className="border-b border-slate-200 px-7 py-7">
        <h3 className="font-display text-xl font-bold text-navy">
          {title}
        </h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((it) => (
          <li
            key={it}
            className={`flex items-center gap-3 px-6 py-7 text-base ${
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
        ))}
      </ul>
    </div>
  );
}

export default function Compare() {
  return (
    <Section className="bg-white">
      <h2 className="h-section">
        Why sell your car online to DriveOffer?
      </h2>
      <div className="mt-12 grid items-start gap-6 md:grid-cols-3">
        <Column title="Dealership trade-in" items={dealership} className="hidden md:block" />
        <Column title="DriveOffer" items={us} highlight />
        <Column title="Private sale" items={privateSale} className="hidden md:block" />
      </div>
    </Section>
  );
}
