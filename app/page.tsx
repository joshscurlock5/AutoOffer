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
import HeroArt from "@/components/HeroArt";
import Reveal from "@/components/Reveal";
import { Section, SectionHeading } from "@/components/Section";
import { site } from "@/lib/site-config";
import {
  Check, Shield, Car, Bolt, Banknote, ArrowRight, Phone,
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
        <div className="container-x relative grid items-start gap-12 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-4 py-1.5 text-sm font-semibold text-navy shadow-soft">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-600" />
              </span>
              Free instant estimate · we come to you
            </span>

            <h1 className="mt-5 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-navy sm:text-6xl">
              Sell your car<br className="hidden sm:block" /> the <span className="text-brand">easy way.</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Get an instant estimate in minutes. We come to you, inspect the car, and
              pay the same visit by e-transfer or bank draft.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/get-offer" className="btn-primary text-lg">
                Get My Instant Estimate <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href={`tel:${site.phoneE164}`}
                className="btn border-2 border-brand bg-white px-6 py-3.5 text-lg text-brand shadow-soft hover:-translate-y-0.5 hover:bg-brand-50 active:translate-y-0"
              >
                <Phone className="h-5 w-5" /> Call Now
              </a>
            </div>
            <p className="mt-3 hidden text-sm text-muted sm:block">
              Want a firm number faster?{" "}
              <a href={`tel:${site.phoneE164}`} className="font-semibold text-navy hover:text-brand">
                Call us at {site.phoneDisplay}
              </a>{" "}
              and we&apos;ll walk through it with you.
            </p>

            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
              {["Free & no obligation", "We come to you", "Paid same visit"].map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm font-medium text-navy">
                  <Check className="h-4 w-4 text-brand" /> {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-fade-up">
            <div className="relative">
              {/* Decorative car graphic shows on desktop only — on mobile the form
                  comes right after the trust bullets so users reach it faster. */}
              <HeroArt className="hidden w-full drop-shadow-[0_24px_50px_rgba(16,41,30,0.28)] lg:block" />
              <div className="relative z-10 mx-auto w-full lg:-mt-16 lg:w-[94%]">
                <ValueWidget />
              </div>
            </div>
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
              Get My Instant Estimate <ArrowRight className="h-5 w-5" />
            </Link>
            <PhoneButton variant="ghost" label="Call Now" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </section>
    </>
  );
}
