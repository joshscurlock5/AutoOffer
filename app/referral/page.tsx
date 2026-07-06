import type { Metadata } from "next";
import ReferralForm from "@/components/ReferralForm";
import { Section, SectionHeading } from "@/components/Section";
import PhoneButton from "@/components/PhoneButton";
import FaqItem from "@/components/FaqItem";
import { site } from "@/lib/site-config";
import { Check, Phone } from "@/components/icons";

export const metadata: Metadata = {
  title: `Refer & Earn $${site.referralReward}`,
  description: `Refer a friend to ${site.name}. When they sell their car, you get $${site.referralReward}. No limit on referrals.`,
};

export default function ReferralPage() {
  const steps = [
    { icon: "/icons/referral-refer.png", title: "Refer a friend", body: "Fill out the form above or share your code. Tell anyone looking to sell their car about DriveOffer." },
    { icon: "/icons/referral-sell.png", title: "They sell their car", body: "Your friend gets a fast, fair offer and sells their vehicle to us — just like you would." },
    { icon: "/icons/referral-reward.png", title: `You get $${site.referralReward}`, body: `Once their sale is complete, we send you $${site.referralReward}. Refer as many friends as you like.` },
  ];

  const finePrint = [
    `The $${site.referralReward} reward is paid after your referred friend completes their sale with ${site.name}.`,
    "Your friend must be a new customer who hasn't already requested an offer.",
    "No limit on the number of friends you can refer.",
    "Rewards are paid by cheque or bank draft, typically within 7 days of the completed sale.",
  ];

  const faqs = [
    {
      q: "When do I get paid?",
      a: `Once your referred friend completes their sale with ${site.name}, we send your $${site.referralReward} reward — typically within 7 days, by cheque or bank draft.`,
    },
    {
      q: "How much do I get?",
      a: `You earn $${site.referralReward} for every friend who successfully sells their car to us. There's no cap, so refer as many people as you like.`,
    },
    {
      q: "Is there a referral limit?",
      a: "Nope — there's no limit on the number of friends you can refer, and you get paid for each one that completes a sale.",
    },
    {
      q: "How do I refer someone?",
      a: "Fill out the form above with your details (and your friend's, if you have them), or call us and mention your friend. We'll take care of the rest.",
    },
    {
      q: "Who can I refer?",
      a: "Anyone looking to sell their car who hasn't already requested an offer from us — friends, family, coworkers and neighbours all count.",
    },
  ];

  return (
    <>
      {/* 1. Image (left) + form (right) — now the top of the page. items-stretch
          forces both columns to the SAME height so their edges line up exactly. */}
      <Section className="bg-white">
        <div className="grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
          {/* LEFT — image card. The form drives the row height; this card stretches
              to match it, and object-cover keeps the photo filling it at any size. */}
          <div className="relative order-2 flex min-h-[560px] flex-col justify-end overflow-hidden rounded-2xl bg-navy text-white shadow-card lg:order-1">
            {/* hero photo */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/referral-hero.jpg" alt="A happy customer referring a friend from their couch" className="absolute inset-0 h-full w-full object-cover" />
            {/* legibility gradient so the text reads over the photo */}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy-900/90 via-navy-900/25 to-transparent" />

            {/* bottom content block (pushed down by justify-end) */}
            <div className="relative p-5 sm:p-7">
              <h1 className="font-display text-4xl font-extrabold leading-[1.05] sm:text-5xl">
                Refer a friend.<br />Earn <span className="text-[#22C55E]">${site.referralReward}</span>.
              </h1>
              <p className="mt-3 max-w-md text-lg text-slate-200">
                It&apos;s fast, easy, and rewards you both.
              </p>

              {/* prefer-to-refer-by-phone card */}
              <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-white p-4 text-navy shadow-card sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Phone className="h-5 w-5" />
                  </span>
                  <p className="font-semibold leading-snug">Prefer to refer by phone?</p>
                </div>
                <PhoneButton variant="dark" className="shrink-0 self-center sm:self-auto" location="referral_hero" />
              </div>
            </div>
          </div>

          {/* Form: right column on desktop, ABOVE the image on mobile. */}
          <div className="order-1 lg:order-2">
            <ReferralForm />
          </div>
        </div>

      </Section>

      {/* 2. How it works — now below the form */}
      <Section className="bg-slate-50">
        <SectionHeading title={`Earn $${site.referralReward} in 3 simple steps`} />
        <div className="mx-auto mt-10 max-w-col wide:max-w-none">
          <div className="relative grid gap-6 wide:grid-cols-3">
            <div className="absolute left-0 right-0 top-9 hidden h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent wide:block" />
            {steps.map((s) => (
              <div key={s.title} className="card relative p-7 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${s.icon}?v=2`} alt="" aria-hidden="true" className="mx-auto h-16 w-16" />
                <h3 className="mt-5 font-display text-xl font-bold text-navy">{s.title}</h3>
                <p className="mt-3 text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* 3. Common questions (FAQ accordions) */}
      <Section className="bg-white">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <SectionHeading
            title="Common questions"
            subtitle={`Everything you need to know about earning $${site.referralReward} for referring a friend to ${site.name}.`}
          />
          <div className="space-y-3">
            {faqs.map((f) => (
              <FaqItem
                key={f.q}
                q={f.q}
                a={f.a}
                summaryClassName="flex cursor-pointer items-center justify-between gap-4 p-5 text-base font-semibold text-navy sm:text-lg"
                chevronClassName="h-5 w-5 shrink-0 text-slate-400 transition duration-300 group-open:rotate-180"
                answerClassName="max-w-[60ch] px-5 pb-5 text-muted"
              />
            ))}
          </div>
        </div>
      </Section>

      {/* 4. The fine print */}
      <Section className="bg-slate-50">
        <p className="font-semibold text-navy">The fine print</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {finePrint.map((t) => (
            <div key={t} className="flex items-start gap-2.5 text-sm text-muted">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>{t}</span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
