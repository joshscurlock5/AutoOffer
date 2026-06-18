import Link from "next/link";
import { site } from "@/lib/site-config";
import { Gift, ArrowRight } from "./icons";

export default function ReferralBanner() {
  return (
    <section className="py-12 sm:py-16">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl bg-navy px-6 py-12 text-center shadow-lift sm:px-14">
          {/* subtle geometric motif on the dark band */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rotate-12 rounded-3xl border-8 border-white/10" />
          <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 -rotate-6 rounded-3xl border-8 border-white/[0.06]" />

          <div className="relative mx-auto max-w-2xl">
            <span className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-white ring-1 ring-white/15">
              <Gift className="h-4 w-4" /> Referral Program
            </span>
            <h2 className="mt-5 font-display text-3xl font-extrabold text-white sm:text-4xl">
              Refer a friend, get <span className="text-emerald-400">${site.referralReward}</span>
            </h2>
            <p className="mt-4 text-lg text-white/80">
              Know someone looking to sell their car? Send them our way. When they
              sell to {site.name}, we&apos;ll send you a ${site.referralReward} cash
              thank-you. No limit on how many friends you refer.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/referral" className="btn-primary">
                Refer Someone <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/referral"
                className="btn bg-transparent text-white hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0"
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
