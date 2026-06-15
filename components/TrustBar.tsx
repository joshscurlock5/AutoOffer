import { Bolt, Car, Banknote, Phone } from "./icons";

// Honest, process-based proof points (no invented stats). Swap in real numbers
// once you have them (e.g. a Google rating, cars-bought count).
const points = [
  { icon: Bolt, title: "Offer in ~15 min", sub: "Estimate now, firm offer same day" },
  { icon: Car, title: "We come to you", sub: "Free at-home inspection" },
  { icon: Banknote, title: "Paid same visit", sub: "E-transfer or bank draft" },
  { icon: Phone, title: "A real person answers", sub: "No bots, no runaround" },
];

export default function TrustBar() {
  return (
    <section className="border-y border-slate-100 bg-white">
      <div className="container-x grid grid-cols-2 gap-x-6 gap-y-8 py-10 md:grid-cols-4 md:divide-x md:divide-slate-100">
        {points.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.title} className="flex items-center gap-3 md:justify-center md:px-2">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <div className="font-display text-base font-bold text-navy">{p.title}</div>
                <div className="text-sm text-muted">{p.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
