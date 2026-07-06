import { site } from "@/lib/site-config";
import { ArrowRight } from "./icons";
import ReferralCtaLink from "@/components/ReferralCtaLink";

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
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          {/* Extra left-to-right darkening so the copy stays legible at any size. */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#16181D,transparent_55%)]" />

          <div className="relative max-w-xl px-6 py-12 sm:px-12 sm:py-16 wide:px-16 wide:py-20">
            <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">
              Refer a friend,{" "}
              {/* Below 860px the subtitle would reach the photo, so collapse:
                  break the heading to a second line so nothing bleeds over the man. */}
              <br className="min-[860px]:hidden" />
              get <span className="text-emerald-400">${site.referralReward}</span>
            </h2>
            {/* Subtitle only above 860px — hidden before it would reach the photo. */}
            <p className="mt-4 hidden max-w-md text-lg text-white/85 min-[860px]:block">
              Know someone selling their car? Send them to {site.name} — when we buy
              it, you get ${site.referralReward}.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ReferralCtaLink
                location="referral_banner"
                className="btn bg-emerald-600 px-6 py-3.5 text-white shadow-soft hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lift active:translate-y-0"
              >
                Refer Someone <ArrowRight className="h-4 w-4" />
              </ReferralCtaLink>
              <ReferralCtaLink
                location="referral_banner_how"
                className="hidden font-semibold text-white underline underline-offset-4 hover:text-white/80 min-[860px]:inline-flex"
              >
                How it works
              </ReferralCtaLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
