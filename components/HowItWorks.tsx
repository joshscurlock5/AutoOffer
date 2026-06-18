import { Section } from "./Section";

const steps = [
  {
    icon: "/icons/step-tell-us.png",
    title: "Tell us about your car",
    body: "Send your details and a few photos.",
  },
  {
    icon: "/icons/step-come-to-you.png",
    title: "We come to you",
    body: "A quick inspection, wherever you are.",
  },
  {
    icon: "/icons/step-get-paid.png",
    title: "Get paid",
    body: "Paid on the spot — we handle the paperwork.",
  },
];

export default function HowItWorks() {
  return (
    <Section id="how" className="bg-cream">
      <h2 className="h-section">How it works</h2>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.title} className="card h-full px-7 py-9 sm:px-8 sm:py-11">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.icon} alt="" aria-hidden="true" className="h-16 w-16" />
            <h3 className="mt-5 text-xl font-bold text-navy">{s.title}</h3>
            <p className="mt-2 text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
