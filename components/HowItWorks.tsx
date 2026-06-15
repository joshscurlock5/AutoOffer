import Link from "next/link";
import { Section, SectionHeading } from "./Section";
import Reveal from "./Reveal";
import PhoneButton from "./PhoneButton";
import { Phone, Calendar, Banknote, ArrowRight } from "./icons";

const steps = [
  {
    icon: Phone,
    title: "Get your offer",
    body: "Send your car's details and a few photos, or just call. We give you a fair offer over the phone or by email — usually the same day.",
  },
  {
    icon: Calendar,
    title: "We come to you",
    body: "Accept, and we book a time and place that works for you. A specialist comes out for a quick inspection — you don't go anywhere.",
  },
  {
    icon: Banknote,
    title: "Get paid",
    body: "Everything checks out and you're paid on the spot — e-transfer or bank draft. We handle the lien and the paperwork.",
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

      <div className="relative mt-20 grid gap-14 md:grid-cols-3 md:gap-8">
        {/* connecting rail */}
        <div className="absolute left-[16%] right-[16%] top-7 hidden h-0.5 bg-gradient-to-r from-brand/15 via-brand/40 to-brand/15 md:block" />
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <Reveal key={s.title} delay={i * 120} className="relative">
              <span className="pointer-events-none absolute -top-[4.25rem] left-1/2 -translate-x-1/2 select-none font-display text-[118px] font-extrabold leading-none text-brand/20 md:left-7">
                {i + 1}
              </span>
              <div className="relative text-center md:text-left">
                <div className="relative z-10 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-soft ring-4 ring-cream md:mx-0">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 font-display text-xl font-bold text-navy">{s.title}</h3>
                <p className="mt-3 text-muted">{s.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>

      <div className="mt-14 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/get-offer" className="btn-primary">
          Get My Estimate <ArrowRight className="h-4 w-4" />
        </Link>
        <PhoneButton variant="ghost" />
      </div>
    </Section>
  );
}
