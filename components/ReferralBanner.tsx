import Link from "next/link";
import { site } from "@/lib/site-config";
import { Gift, ArrowRight } from "./icons";

export default function ReferralBanner() {
  return (
    <section className="py-16 sm:py-20">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl bg-navy px-6 py-12 text-center text-white shadow-lift sm:px-12">
          {/* on-brand motif instead of blur blobs */}
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.12]" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rotate-12 rounded-3xl border-8 border-accent/25" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 -rotate-6 rounded-3xl border-8 border-white/10" />

          <div className="relative mx-auto max-w-2xl">
            <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-navy">
              <Gift className="h-4 w-4" /> Referral Program
            </span>
            <h2 className="mt-5 font-display text-3xl font-extrabold sm:text-4xl">
              Refer a friend, get <span className="text-accent">${site.referralReward}</span>
            </h2>
            <p className="mt-4 text-lg text-slate-300">
              Know someone looking to sell their car? Send them our way. When they
              sell to {site.name}, we&apos;ll send you a ${site.referralReward} cash
              thank-you. No limit on how many friends you refer.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/referral" className="btn-accent">
                Refer Someone <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/referral"
                className="btn border border-white/30 px-6 py-3.5 text-white hover:bg-white/10"
              >
                How it works
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
