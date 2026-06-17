import Link from "next/link";
import { Section, SectionHeading } from "./Section";
import Reveal from "./Reveal";
import PhoneButton from "./PhoneButton";
import { Phone, Calendar, Banknote, ArrowRight } from "./icons";

const steps = [
  {
    icon: Phone,
    title: "Tell us about your car",
    body: "Send your details and a few photos — we send a fair offer, usually same day.",
  },
  {
    icon: Calendar,
    title: "We come to you",
    body: "Pick a time and place; a specialist comes out for a quick inspection.",
  },
  {
    icon: Banknote,
    title: "Get paid",
    body: "Everything checks out and you're paid on the spot — we handle the paperwork.",
  },
];

export default function HowItWorks() {
  return (
    <Section id="how" className="bg-cream">
      <SectionHeading
        center
        eyebrow="How It Works"
        title="Sell your car in 3 simple steps"
        subtitle="From first call to cash in hand — most sales wrap up in a single visit."
      />

      <div className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
        {/* connecting rail */}
        <div className="absolute left-[16%] right-[16%] top-7 hidden h-0.5 bg-gradient-to-r from-brand/15 via-brand/40 to-brand/15 md:block" />
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.title} delay={i * 120} className="relative text-center">
              {/* step number — sits cleanly above each icon, fully visible */}
              <span className="pointer-events-none absolute -top-[3.25rem] left-1/2 -translate-x-1/2 select-none font-display text-5xl font-extrabold leading-none text-brand/40">
                {i + 1}
              </span>
              <div className="relative">
                <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-soft ring-4 ring-cream">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-navy">{s.title}</h3>
                <p className="mt-2 text-muted">{s.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>

      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/get-offer" className="btn-primary">
          Get My Estimate <ArrowRight className="h-4 w-4" />
        </Link>
        <PhoneButton variant="ghost" location="how_it_works" />
      </div>
    </Section>
  );
}
