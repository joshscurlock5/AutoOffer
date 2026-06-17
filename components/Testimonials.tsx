import Link from "next/link";
import { Section } from "./Section";
import Reveal from "./Reveal";
import { site } from "@/lib/site-config";
import { Check, Shield, ArrowRight, Star } from "./icons";

// NOTE: This replaces fabricated testimonials. When you have real Google/Facebook
// reviews, drop them into the right-hand card (set `site.reviewsUrl`), or embed a
// reviews widget. Never ship invented quotes.
const promises = [
  "The number we agree on is the number you're paid — no surprise deductions.",
  "A real local person answers the phone — never a call centre.",
  "No obligation, ever — the estimate is free and you can walk away any time.",
];

export default function Promise() {
  return (
    <Section className="bg-white">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="eyebrow">Our Promise</p>
          <h2 className="h-section mt-2">No games. Just a fair deal.</h2>
          <p className="mt-4 text-lg text-muted">
            Selling to a stranger shouldn&apos;t feel risky — here&apos;s what you can
            count on, every time.
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
          <div className="card relative overflow-hidden p-8 sm:p-10">
            <div className="relative">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white">
                <Shield className="h-7 w-7" />
              </span>
              <h3 className="mt-6 font-display text-2xl font-bold text-navy">
                The {site.name} guarantee
              </h3>
              <p className="mt-3 text-muted">
                If the car matches what you told us, we pay our offer in full on the
                spot. If anything&apos;s different, you&apos;re free to walk away.
              </p>

              <div className="mt-7 flex items-center gap-3 rounded-2xl bg-brand-50 p-4">
                <span className="flex text-brand" role="img" aria-label="Five stars">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4" />)}
                </span>
                <div className="text-sm text-muted">
                  Sold with us?{" "}
                  <Link href={site.reviewsUrl || "#"} className="font-semibold text-navy underline-offset-2 hover:underline">
                    Leave a review
                  </Link>{" "}
                  — we&apos;re building ours from real customers.
                </div>
              </div>

              <Link
                href="/get-offer"
                className="mt-7 inline-flex items-center gap-2 font-semibold text-brand hover:gap-3"
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
