import Link from "next/link";
import { site } from "@/lib/site-config";
import { Gift, ArrowRight } from "./icons";

export default function ReferralBanner() {
  return (
    <section className="py-12 sm:py-16">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl bg-navy shadow-lift">
          {/* Photo (navy gradient baked into the left for the text). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/referral.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[72%_30%]"
          />
          {/* Extra left-to-right darkening so the copy stays legible at any size. */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#16181D,transparent_55%)]" />

          <div className="relative max-w-xl px-6 py-12 sm:px-12 sm:py-16 wide:px-16 wide:py-20">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-white ring-1 ring-white/15">
              <Gift className="h-4 w-4" /> Referral Program
            </span>
            <h2 className="mt-5 font-display text-3xl font-extrabold text-white sm:text-4xl">
              Refer a friend, get <span className="text-emerald-400">${site.referralReward}</span>
            </h2>
            <p className="mt-4 max-w-md text-lg text-white/85">
              Know someone selling their car? Send them to {site.name} — when we buy
              it, you get ${site.referralReward}.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/referral" className="btn-primary">
                Refer Someone <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/referral"
                className="font-semibold text-white underline underline-offset-4 hover:text-white/80"
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
