import { Section } from "./Section";
import { Star, GoogleG } from "./icons";
import { site, amvicLicence } from "@/lib/site-config";

const points = [
  { icon: "/icons/whysell-easy.png", title: "Easy", body: "Sell your car fast, safe, and fair." },
  { icon: "/icons/whysell-finance.png", title: "Finance", body: "We settle your finance and pay you the balance." },
  { icon: "/icons/whysell-tradein.png", title: "Trade-In", body: "In many cases we beat dealer trade-in offers." },
];

export default function WhySell() {
  return (
    <Section className="bg-white">
      <div className="mx-auto max-w-col wide:max-w-none">
        {/* Compartment 1 — the trust / stats banner, on its own. */}
        <div className="card px-6 py-8 sm:py-10">
          <div className="flex flex-col items-center justify-center gap-8 wide:flex-row wide:gap-12">
            {/* Cars purchased */}
            <div className="text-center">
              <p className="font-display text-4xl font-extrabold text-brand sm:text-5xl">
                {site.carsBought.toLocaleString("en-CA")}+
              </p>
              <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted">Cars purchased</p>
            </div>

            <div className="hidden h-16 w-px bg-slate-200 wide:block" />

            {/* Google rating — same badge as elsewhere, scaled to match the stat. */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2.5">
                <span className="flex text-amber-400" role="img" aria-label="5.0 out of 5 stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-7 w-7 sm:h-8 sm:w-8" />
                  ))}
                </span>
                <span className="font-display text-4xl font-extrabold text-navy sm:text-5xl">5.0</span>
              </div>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted">
                <GoogleG className="h-4 w-4" /> Google reviews
              </p>
            </div>

            <div className="hidden h-16 w-px bg-slate-200 wide:block" />

            {/* Paid to sellers */}
            <div className="text-center">
              <p className="font-display text-4xl font-extrabold text-brand sm:text-5xl">$45M+</p>
              <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted">Paid to sellers</p>
            </div>
          </div>

          {amvicLicence && (
            <p className="mt-6 text-center text-sm text-muted">{amvicLicence} · Owned by {site.owner}</p>
          )}
        </div>

        {/* Compartment 2 — "Why sell", laid out like the How it works cards:
            spread across on wide screens, stacking one-per-row below `wide`. */}
        <div className="mt-12">
          <h2 className="h-section">Why sell my car to DriveOffer?</h2>
          <div className="mt-6 grid gap-6 wide:grid-cols-3">
            {points.map((p) => (
              <div key={p.title} className="card h-full px-7 pb-9 pt-6 sm:px-8 sm:pb-11 sm:pt-7">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.icon} alt="" aria-hidden="true" className="h-20 w-20" />
                <h3 className="mt-7 text-xl font-bold text-navy">{p.title}</h3>
                <p className="mt-4 text-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
