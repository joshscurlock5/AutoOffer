import { Section } from "./Section";
import { Sparkles, Landmark, ArrowLeftRight } from "./icons";

const points = [
  { icon: Sparkles, title: "Easy", body: "Sell your car fast, safe, and fair." },
  { icon: Landmark, title: "Finance", body: "We settle your finance and pay you the balance." },
  { icon: ArrowLeftRight, title: "Trade-In", body: "In many cases we beat dealer trade-in offers." },
];

export default function WhySell() {
  return (
    <Section className="bg-white">
      <div className="text-center">
        <p className="font-display text-4xl font-extrabold text-brand sm:text-5xl">2,000+</p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted">Cars purchased</p>
        <h2 className="mt-5 font-display text-2xl font-bold text-navy sm:text-3xl">
          Why sell my car to DriveOffer?
        </h2>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl gap-8 sm:grid-cols-3">
        {points.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.title} className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-navy">{p.title}</h3>
              <p className="mt-1.5 text-muted">{p.body}</p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
