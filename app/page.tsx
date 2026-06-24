import ValueWidget from "@/components/ValueWidget";
import HowItWorks from "@/components/HowItWorks";
import SecurePayment from "@/components/SecurePayment";
import Compare from "@/components/Compare";
import ReferralBanner from "@/components/ReferralBanner";
import Promise from "@/components/Testimonials";
import Faq from "@/components/Faq";
import StickyCTA from "@/components/StickyCTA";
import { site } from "@/lib/site-config";
import { GoogleG, Star, Lock } from "@/components/icons";

export default function HomePage() {
  return (
    <>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden bg-cream">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative py-10 lg:py-14">
          {/* Hero content column — left-aligned in the phone view, centered + full width on desktop. */}
          <div className="mx-auto max-w-col wide:max-w-none">
            <div className="animate-fade-up text-left wide:text-center">
              <h1 className="font-display text-[2.75rem] font-extrabold leading-[1.08] tracking-tight text-navy sm:text-[4.5rem]">
                Get a real offer in 2 minutes.
              </h1>
              <div className="mt-8 flex flex-wrap items-center justify-start gap-x-4 gap-y-2 wide:justify-center lg:mt-10">
                <p className="text-[1.375rem] text-navy wide:text-[1.75rem]">
                  Free, no obligation, paid the same day. <span className="font-bold">That&apos;s DriveOffer.</span>
                </p>
                {(site.reviewsUrl as string) && (
                  <a
                    href={site.reviewsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="See us on Google Reviews"
                    className="hidden items-center gap-2.5 wide:inline-flex"
                  >
                    <GoogleG className="h-7 w-7" />
                    <span className="flex text-amber-400" role="img" aria-label="5.0 out of 5 stars">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <Star key={i} className="h-6 w-6" />
                      ))}
                    </span>
                    <span className="font-display text-2xl font-extrabold text-navy">5.0</span>
                    <span className="text-lg text-muted">stars</span>
                  </a>
                )}
              </div>
            </div>

            <div id="estimate" className="mt-14 animate-fade-up scroll-mt-24 sm:mt-20">
              <ValueWidget />
            </div>

            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
              <Lock className="h-4 w-4" /> Secure form. Your details are only used to prepare your vehicle estimate.
            </p>
          </div>
        </div>
      </section>

      <HowItWorks />

      <SecurePayment />

      <Compare />

      <Promise />
      <Faq />
      <ReferralBanner />

      <StickyCTA />
    </>
  );
}
