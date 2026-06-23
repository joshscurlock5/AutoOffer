import { Section } from "./Section";
import { site, amvicLicence } from "@/lib/site-config";

const points = [
  { icon: "/icons/whysell-easy.png", title: "Easy", body: "Sell your car fast, safe, and fair." },
  { icon: "/icons/whysell-finance.png", title: "Finance", body: "We settle your finance and pay you the balance." },
  { icon: "/icons/whysell-tradein.png", title: "Trade-In", body: "In many cases we beat dealer trade-in offers." },
];

export default function WhySell() {
  return (
    <Section className="bg-white">
      <div className="text-center">
        <p className="font-display text-4xl font-extrabold text-brand sm:text-5xl">{site.carsBought.toLocaleString("en-CA")}+</p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted">Cars purchased</p>
        {amvicLicence && (
          <p className="mt-3 text-sm text-muted">{amvicLicence} · Owned by {site.owner}</p>
        )}
        <h2 className="mt-5 font-display text-2xl font-bold text-navy sm:text-3xl">
          Why sell my car to DriveOffer?
        </h2>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl gap-8 sm:grid-cols-3">
        {points.map((p) => (
          <div key={p.title} className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.icon} alt="" aria-hidden="true" className="mx-auto h-20 w-20" />
            <h3 className="mt-4 text-lg font-bold text-navy">{p.title}</h3>
            <p className="mt-1.5 text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
