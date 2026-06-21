import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHeading } from "@/components/Section";
import PhoneButton from "@/components/PhoneButton";
import { site } from "@/lib/site-config";
import { Shield, Dollar, Clock, Check, Car, ArrowRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "About Us",
  description: `${site.name} is Canada's easy, fair way to sell your car. Learn how we got started and why thousands of Canadians trust us with their vehicles.`,
};

const values = [
  { icon: Dollar, title: "Fair, transparent pricing", body: "Every offer is backed by live market data — no lowballing, no hidden fees." },
  { icon: Clock, title: "Respect for your time", body: "Offer to payment in as little as a day, and we come to you." },
  { icon: Shield, title: "Safety first", body: "No strangers in your driveway, no cash meetups — just a secure sale." },
  { icon: Car, title: "Any car, any condition", body: "New, old, financed, leased or barely running — we'll make an offer." },
];

// Honest, defensible claims — not invented counts. Swap in real numbers later.
const stats = [
  { value: "Free", label: "Offers, every time" },
  { value: "Same day", label: "Most offers turned around" },
  { value: "To you", label: "We come to your door" },
];

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
            <SectionHeading eyebrow="Our Story" title="Why we started DriveOffer" />
            {/* Owner: personalize this with your founding year, city, and a real
                number of cars bought once you're ready — specifics build real trust. */}
            <div className="mt-5 space-y-4 text-muted">
              <p>
                Selling a car the usual way is a hassle — endless listings, no-shows,
                and a haircut at the dealership trade-in counter.
              </p>
              <p>
                We started {site.name} to make it easy instead: a fair, upfront number,
                a team that comes to you, and payment the same day. No pressure, no games.
              </p>
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/get-offer" className="btn-primary">Get My Offer <ArrowRight className="h-4 w-4" /></Link>
              <PhoneButton variant="ghost" />
            </div>
          </div>

          <div className="rounded-3xl border border-brand-100 bg-brand-50 p-8 shadow-soft ring-1 ring-brand-100">
            <h3 className="font-display text-2xl font-bold text-navy">Why sellers choose us</h3>
            <ul className="mt-6 space-y-4">
              {[
                "Free, no-obligation offers",
                "We come to you, anywhere in Canada",
                "We buy financed & leased cars too",
                "Payment on the spot — we handle the paperwork",
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

      {/* Values */}
      <Section className="bg-slate-50">
        <SectionHeading center eyebrow="What We Stand For" title="Our values" subtitle="Everything we do comes back to making this the easiest, most honest way to sell a car." />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
            <Link href="/get-offer" className="btn bg-white px-7 py-3.5 text-brand hover:bg-brand-50">Get My Instant Estimate <ArrowRight className="h-5 w-5" /></Link>
            <PhoneButton variant="dark" />
          </div>
        </div>
      </section>
    </>
  );
}
