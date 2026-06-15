import Link from "next/link";
import { Section } from "./Section";
import Reveal from "./Reveal";
import { site } from "@/lib/site-config";
import { Check, Shield, ArrowRight, Star } from "./icons";

// NOTE: This replaces fabricated testimonials. When you have real Google/Facebook
// reviews, drop them into the right-hand card (set `site.reviewsUrl`), or embed a
// reviews widget. Never ship invented quotes.
const promises = [
  "A real, no-obligation offer — walk away any time, always free.",
  "The number we agree on is the number you're paid. No surprise deductions.",
  "You're paid before we take the keys — Interac e-transfer or bank draft.",
  "We come to you and handle the lien and paperwork ourselves.",
  "A real local person answers the phone — never a call centre.",
];

export default function Promise() {
  return (
    <Section className="bg-white">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="eyebrow">Our Promise</p>
          <h2 className="h-section mt-2">No games. Just a fair deal.</h2>
          <p className="mt-4 text-lg text-muted">
            Selling a car to a stranger shouldn&apos;t feel risky. Here&apos;s exactly
            what you can count on from {site.name}, every time.
          </p>
          <ul className="mt-7 space-y-4">
            {promises.map((p, i) => (
              <Reveal key={p} delay={i * 70}>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-white">
                    <Check className="h-4 w-4" />
                  </span>
                  <span className="text-navy">{p}</span>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal>
          <div className="card-spotlight relative overflow-hidden p-8 sm:p-10">
            <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
            <div className="relative">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-navy">
                <Shield className="h-7 w-7" />
              </span>
              <h3 className="mt-6 font-display text-2xl font-bold text-white">
                The {site.name} guarantee
              </h3>
              <p className="mt-3 text-slate-300">
                If the car matches what you told us, we honour our offer in full and
                pay you on the spot. If anything&apos;s different, we&apos;ll show you
                exactly what changed — and you&apos;re free to walk away.
              </p>

              <div className="mt-7 flex items-center gap-3 rounded-2xl bg-white/5 p-4">
                <span className="flex text-accent" role="img" aria-label="Five stars">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4" />)}
                </span>
                <div className="text-sm text-slate-300">
                  Sold with us?{" "}
                  <Link href={site.reviewsUrl || "#"} className="font-semibold text-white underline-offset-2 hover:underline">
                    Leave a review
                  </Link>{" "}
                  — we&apos;re building ours from real customers.
                </div>
              </div>

              <Link
                href="/get-offer"
                className="mt-7 inline-flex items-center gap-2 font-semibold text-accent hover:gap-3"
              >
                Get your fair offer <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
