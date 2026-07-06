import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/Section";
import PhoneButton from "@/components/PhoneButton";
import OfferCtaLink from "@/components/OfferCtaLink";
import { site } from "@/lib/site-config";
import { Shield, Dollar, Check, Car, ArrowRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "About Us",
  description: `Meet Samir Osman, the AMVIC-licensed wholesaler (licence B2036941) behind ${site.name} — 5 years and 5,000+ cars bought directly from sellers across Edmonton and Alberta.`,
};

const values = [
  { icon: Dollar, title: "Fair, transparent pricing", body: "Every offer is backed by live market data — no lowballing, no hidden fees." },
  { icon: Shield, title: "Safety first", body: "No strangers in your driveway, no cash meetups — just a secure sale." },
  { icon: Car, title: "Any car, any condition", body: "New, old, financed, leased or barely running — we'll make an offer." },
];

// Honest, defensible claims — not invented counts. Swap in real numbers later.
const stats = [
  { value: "Free", label: "Offers, every time" },
  { value: "Same day", label: "Most offers turned around" },
  { value: "To you", label: "We come to your door" },
];

// Initials for the team avatars (no photos needed) — "Joshua Scurlock" -> "JS".
const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative py-12 text-center sm:py-16">
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-navy sm:text-5xl">
            We make selling your car simple, fast and fair
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Selling your car should be simple. {site.name} gives you a fair offer,
            comes to you, and handles the hard part.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-100 bg-white">
        <div className="container-x grid grid-cols-3 gap-x-4 gap-y-8 py-10">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-2xl font-extrabold text-navy sm:text-4xl">{s.value}</div>
              <div className="mt-1 text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Story */}
      <Section className="bg-white">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Our Story" title="Meet Samir Osman, the wholesaler behind DriveOffer" />
            <div className="mt-5 space-y-4 text-muted">
              <p>
                {site.name} started with a simple idea: make selling a car in Edmonton
                straightforward and honest. Founder Samir Osman is an AMVIC-licensed
                wholesaler who buys vehicles directly from the public and moves them on to
                dealers and auctions, so sellers skip the hassle of listings, tire-kickers,
                and lowball offers.
              </p>
              <p>
                Over the past five years, Samir has personally purchased more than 5,000
                cars. He comes to you anywhere in Edmonton and the surrounding Alberta
                communities — Sherwood Park, St. Albert, Leduc and beyond — makes an offer,
                and pays by bank draft.
              </p>
              <p>
                Being licensed by AMVIC, the Alberta Motor Vehicle Industry Council, is what
                sets {site.name} apart from unlicensed curbsiders. It means Samir operates
                under Alberta&apos;s vehicle-industry regulations, giving you a legitimate,
                accountable buyer when it&apos;s time to sell your car.
              </p>
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <OfferCtaLink location="about_story" className="btn-primary">Get a Free Offer <ArrowRight className="h-4 w-4" /></OfferCtaLink>
              <PhoneButton variant="ghost" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-soft ring-1 ring-slate-200">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white">
                <Shield className="h-6 w-6" />
              </span>
              <h3 className="font-display text-2xl font-bold text-navy">Licensed &amp; accountable</h3>
            </div>
            <ul className="mt-6 space-y-4">
              {[
                "AMVIC-licensed wholesaler — licence #B2036941 (Wholesaler class)",
                "Regulated by AMVIC, the Alberta Motor Vehicle Industry Council",
                "5 years wholesaling vehicles in the Edmonton area",
                "5,000+ cars purchased directly from the public",
                "Carries $3,000,000/year in dealer-plate (garage) insurance on its own business operations",
                "Serves Edmonton and surrounding Alberta; comes to you and pays by bank draft",
              ].map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-white">
                    <Check className="h-4 w-4" />
                  </span>
                  <span className="text-navy">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Team */}
      <Section className="bg-white">
        <SectionHeading center eyebrow="Our Team" title="The DriveOffer team" subtitle="The people behind every offer." />
        <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
          {site.team.map((m) => (
            <div key={m.name} className="card h-full p-7 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-50 font-display text-xl font-extrabold text-brand">
                {initials(m.name)}
              </span>
              <h3 className="mt-4 text-lg font-bold text-navy">{m.name}</h3>
              <p className="mt-1 text-sm text-muted">{m.role}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4 text-center text-sm text-muted">
          {site.name} is owned and operated by{" "}
          <span className="font-semibold text-navy">{site.operatedBy}</span>.
        </p>
      </Section>

      {/* Values */}
      <Section className="bg-slate-50">
        <SectionHeading center eyebrow="What We Stand For" title="Our values" subtitle="Everything we do comes back to making this the easiest, most honest way to sell a car." />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((v) => {
            const Icon = v.icon;
            return (
              <div key={v.title} className="card h-full p-7">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-navy">{v.title}</h3>
                <p className="mt-2 text-muted">{v.body}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Coverage */}
      <Section className="bg-white">
        <SectionHeading center eyebrow="Where We Buy" title="Proudly Canadian, coast to coast" subtitle="We purchase vehicles across the country and we&apos;re always expanding." />
        <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-3">
          {site.provinces.map((p) => (
            <span key={p} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-navy">
              {p}
            </span>
          ))}
        </div>
      </Section>

      <section className="bg-brand">
        <div className="container-x flex flex-col items-center gap-6 py-12 text-center">
          <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">Ready to see your offer?</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <OfferCtaLink location="about_closing" className="btn bg-white px-7 py-3.5 text-brand hover:bg-brand-50">Get a Free Offer <ArrowRight className="h-5 w-5" /></OfferCtaLink>
            <PhoneButton variant="dark" />
          </div>
        </div>
      </section>
    </>
  );
}
