import { Section } from "./Section";
import { Check } from "./icons";
import ReviewsCarousel from "./ReviewsCarousel";

// Real, owner-confirmed trust points (no fabricated reviews/ratings).
const promises = [
  "The number we agree on is what you're paid — no surprise deductions.",
  "Paid by bank draft, before we take the keys.",
  "No obligation, ever — the estimate is free.",
];

export default function Promise() {
  return (
    <Section className="bg-white">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
          {/* Left — the headline stat */}
          <div className="p-8 sm:p-10">
            <p className="font-display text-5xl font-extrabold tracking-tight text-navy sm:text-6xl">
              2,000+
            </p>
            <p className="mt-2 text-lg font-medium text-muted">cars sold to DriveOffer</p>
            <ul className="mt-7 space-y-3.5 border-t border-slate-100 pt-6 text-lg text-muted">
              {promises.map((p) => (
                <li key={p} className="flex items-start gap-2.5">
                  <Check className="mt-1 h-5 w-5 shrink-0 text-navy" /> {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — rotating Google reviews */}
          <ReviewsCarousel />
        </div>
      </div>
    </Section>
  );
}
