import Link from "next/link";
import { site } from "@/lib/site-config";
import { Gift, ArrowRight } from "./icons";

export default function ReferralBanner() {
  return (
    <section className="py-12 sm:py-16">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl border border-brand-100 bg-brand-50 px-6 py-10 text-center shadow-soft sm:px-12">
          {/* on-brand motif instead of blur blobs */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rotate-12 rounded-3xl border-8 border-brand-100" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 -rotate-6 rounded-3xl border-8 border-brand-100/60" />

          <div className="relative mx-auto max-w-2xl">
            <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white">
              <Gift className="h-4 w-4" /> Referral Program
            </span>
            <h2 className="mt-5 font-display text-3xl font-extrabold text-navy sm:text-4xl">
              Refer a friend, get <span className="text-brand">${site.referralReward}</span>
            </h2>
            <p className="mt-4 text-lg text-muted">
              Know someone looking to sell their car? Send them our way. When they
              sell to {site.name}, we&apos;ll send you a ${site.referralReward} cash
              thank-you. No limit on how many friends you refer.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/referral" className="btn-primary">
                Refer Someone <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/referral" className="btn-ghost">
                How it works
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
