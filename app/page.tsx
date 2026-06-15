import Link from "next/link";
import ValueWidget from "@/components/ValueWidget";
import TrustBar from "@/components/TrustBar";
import HowItWorks from "@/components/HowItWorks";
import Brands from "@/components/Brands";
import ReferralBanner from "@/components/ReferralBanner";
import Promise from "@/components/Testimonials";
import Faq from "@/components/Faq";
import MapEmbed from "@/components/MapEmbed";
import PhoneButton from "@/components/PhoneButton";
import Reveal from "@/components/Reveal";
import { Section, SectionHeading } from "@/components/Section";
import { site } from "@/lib/site-config";
import {
  Check, Shield, Car, Bolt, Banknote, ArrowRight, Phone, Tag, MapPin, Dollar,
} from "@/components/icons";

const smallBenefits = [
  {
    icon: Bolt,
    tone: "brand",
    title: "Your estimate in minutes",
    body: "Answer a few questions and see an honest estimated range right away. A specialist confirms your firm number by phone or text.",
  },
  {
    icon: Car,
    tone: "brand",
    title: "We come to you",
    body: "Free inspection at your home or work, anywhere we serve. You never have to drive to a lot or wait around.",
  },
  {
    icon: Banknote,
    tone: "gold",
    title: "Paid on the spot",
    body: "Interac e-transfer or bank draft before we load the car. No envelopes of cash, no sketchy meetups.",
  },
  {
    icon: Shield,
    tone: "brand",
    title: "We handle the paperwork",
    body: "Financed or leased? We deal with your lender directly and clear the lien. You just sign and get paid.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden bg-cream">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative grid items-center gap-10 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
          {/* LEFT — short, tight, supporting (below the form on mobile) */}
          <div className="order-2 animate-fade-up lg:order-1">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-4 py-1.5 text-sm font-semibold text-navy shadow-soft">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white">
                <Check className="h-3 w-3" />
              </span>
              Free estimate · we come to you
            </span>

            <h1 className="mt-5 font-display text-[2rem] font-extrabold leading-[1.05] tracking-tight text-navy sm:text-6xl">
              Sell your car<br className="hidden sm:block" /> the <span className="text-brand">easy way.</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Get your estimate in minutes. We come to you, inspect the car, and
              pay the same visit by e-transfer or bank draft.
            </p>

            <ul className="mt-7 space-y-3.5">
              {[
                { icon: Tag, label: "Free & no obligation" },
                { icon: MapPin, label: "We come to you" },
                { icon: Dollar, label: "Paid same visit" },
              ].map((b) => {
                const Icon = b.icon;
                return (
                  <li key={b.label} className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-lg font-semibold text-navy">{b.label}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-7 border-t border-slate-200 pt-6">
              <a href={`tel:${site.phoneE164}`} className="group flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand transition group-hover:bg-brand group-hover:text-white">
                  <Phone className="h-5 w-5" />
                </span>
                <span className="leading-snug">
                  <span className="block font-semibold text-navy">
                    Prefer to talk? Call or text <span className="text-brand">{site.phoneDisplay}</span>
                  </span>
                  <span className="block text-sm text-muted">We&apos;re available 24/7.</span>
                </span>
              </a>
            </div>
          </div>

          {/* RIGHT — the form is the hero (first on mobile) */}
          <div id="estimate" className="order-1 animate-fade-up scroll-mt-24 lg:order-2">
            <ValueWidget />
          </div>
        </div>
      </section>

      <TrustBar />

      {/* ---------------- BENEFITS (asymmetric) ---------------- */}
      <Section className="bg-white">
        <SectionHeading
          eyebrow={`Why ${site.name}`}
          title="A better way to sell, start to finish"
          subtitle="No listings, no tire-kickers, no lowball trade-in. Just a fair number and a team that comes to you."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:grid-rows-2">
          {/* spotlight */}
          <Reveal className="lg:col-span-1 lg:row-span-2">
            <div className="card-spotlight flex h-full flex-col p-8">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-navy">
                <Banknote className="h-7 w-7" />
              </span>
              <h3 className="mt-6 font-display text-2xl font-bold">More money in your pocket</h3>
              <p className="mt-3 text-slate-300">
                We skip the dealership overhead and reconditioning markup, so your
                offer reflects what the car is actually worth — usually more than a
                trade-in counter will give you.
              </p>
              <div className="mt-auto pt-8">
                <Link href="/get-offer" className="inline-flex items-center gap-2 font-semibold text-accent hover:gap-3">
                  See what yours is worth <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>

          {smallBenefits.map((b, i) => {
            const Icon = b.icon;
            const gold = b.tone === "gold";
            return (
              <Reveal key={b.title} delay={80 * (i + 1)}>
                <div className="card h-full p-7 transition duration-300 hover:-translate-y-1 hover:shadow-lift">
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-xl ${
                      gold ? "bg-accent/15 text-accent-700" : "bg-brand-50 text-brand"
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-navy">{b.title}</h3>
                  <p className="mt-2 text-muted">{b.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Section>

      <HowItWorks />
      <Brands />
      <ReferralBanner />
      <Promise />
      <Faq />
      <MapEmbed />

      {/* ---------------- FINAL CTA (distinct finale) ---------------- */}
      <section className="relative overflow-hidden bg-navy">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.15]" />
        <div className="container-x relative flex flex-col items-start gap-8 py-16 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              Find out what your car is worth — <span className="text-accent">today.</span>
            </h2>
            <p className="mt-3 text-lg text-slate-300">
              It takes about two minutes and it&apos;s completely free. No obligation,
              no pressure — just a fair offer.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link href="/get-offer" className="btn-gold text-lg">
              Get My Estimate <ArrowRight className="h-5 w-5" />
            </Link>
            <PhoneButton variant="ghost" label="Call Now" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </section>
    </>
  );
}
