import type { Metadata } from "next";
import ReferralForm from "@/components/ReferralForm";
import { Section, SectionHeading } from "@/components/Section";
import PhoneButton from "@/components/PhoneButton";
import { site } from "@/lib/site-config";
import { Gift, Car, Dollar } from "@/components/icons";

export const metadata: Metadata = {
  title: `Refer & Earn $${site.referralReward}`,
  description: `Refer a friend to ${site.name}. When they sell their car, you get $${site.referralReward}. No limit on referrals.`,
};

export default function ReferralPage() {
  const steps = [
    { icon: Gift, title: "Refer a friend", body: "Fill out the form below or share your code. Tell anyone looking to sell their car about Auto Offer." },
    { icon: Car, title: "They sell their car", body: "Your friend gets a fast, fair offer and sells their vehicle to us — just like you would." },
    { icon: Dollar, title: `You get $${site.referralReward}`, body: `Once their sale is complete, we send you $${site.referralReward}. Refer as many friends as you like.` },
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rotate-12 rounded-[2rem] border-8 border-accent/25" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 -rotate-6 rounded-[2rem] border-8 border-white/10" />
        <div className="container-x relative py-16 text-center sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-navy">
            <Gift className="h-4 w-4" /> Referral Program
          </span>
          <h1 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-5xl">
            Refer a friend, get <span className="text-accent">${site.referralReward}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            Love how easy it was to sell with {site.name}? Spread the word. Every
            friend who sells their car earns you a ${site.referralReward} cash
            thank-you — with no limit on how many you can refer.
          </p>
        </div>
      </section>

      {/* How it works */}
      <Section className="bg-white">
        <SectionHeading center eyebrow="How It Works" title={`Earn $${site.referralReward} in 3 simple steps`} />
        <div className="relative mt-12 grid gap-6 md:grid-cols-3">
          <div className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-brand-100 to-transparent md:block" />
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="card relative p-7 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand text-white shadow-soft">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-navy">{s.title}</h3>
                <p className="mt-3 text-muted">{s.body}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Form + terms */}
      <Section className="bg-slate-50">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Get Started" title="Send us your referral" subtitle="Give us your details so we know who to thank, and your friend's info if you have it. We'll take care of the rest." />
            <div className="mt-6 rounded-2xl bg-white p-6 shadow-card">
              <p className="font-semibold text-navy">Prefer to refer by phone?</p>
              <p className="mt-1 text-sm text-muted">Call us and mention your friend — we&apos;ll set everything up.</p>
              <div className="mt-4"><PhoneButton variant="primary" /></div>
            </div>
            <div className="mt-6 text-sm text-muted">
              <p className="font-semibold text-navy">The fine print</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>The ${site.referralReward} reward is paid after your referred friend completes their sale with {site.name}.</li>
                <li>Your friend must be a new customer who hasn&apos;t already requested an offer.</li>
                <li>No limit on the number of friends you can refer.</li>
                <li>Rewards are paid by e-transfer or cheque, typically within 7 days of the completed sale.</li>
              </ul>
            </div>
          </div>

          <ReferralForm />
        </div>
      </Section>
    </>
  );
}
