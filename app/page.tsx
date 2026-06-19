import ValueWidget from "@/components/ValueWidget";
import HowItWorks from "@/components/HowItWorks";
import Compare from "@/components/Compare";
import GetPaid from "@/components/GetPaid";
import ReferralBanner from "@/components/ReferralBanner";
import Promise from "@/components/Testimonials";
import Faq from "@/components/Faq";
import StickyCTA from "@/components/StickyCTA";
import { site } from "@/lib/site-config";
import { GoogleG, Star } from "@/components/icons";

export default function HomePage() {
  return (
    <>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden bg-cream">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative py-10 lg:py-14">
          {/* TEST LAYOUT: headline + tagline w/ inline Google badge, then full-width form */}
          <div className="animate-fade-up text-center">
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-navy sm:text-5xl lg:whitespace-nowrap lg:text-[clamp(3.25rem,5.2vw,5rem)]">
              Sell your car the easy way.
            </h1>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <p className="text-2xl text-navy sm:text-[1.75rem]">
                Free estimate. No haggling. <span className="font-bold">That&apos;s DriveOffer.</span>
              </p>
              {(site.reviewsUrl as string) && (
                <a
                  href={site.reviewsUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="See us on Google Reviews"
                  className="inline-flex items-center gap-2"
                >
                  <GoogleG className="h-6 w-6" />
                  <span className="flex text-amber-400" role="img" aria-label="Five stars">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="h-5 w-5" />
                    ))}
                  </span>
                  <span className="text-base font-semibold text-muted">Google Reviews</span>
                </a>
              )}
            </div>
          </div>

          <div id="estimate" className="mt-14 animate-fade-up scroll-mt-24 sm:mt-20">
            <ValueWidget />
          </div>
        </div>
      </section>

      <HowItWorks />

      <GetPaid />

      <Compare />

      <Promise />
      <ReferralBanner />
      <Faq />

      <StickyCTA />
    </>
  );
}
