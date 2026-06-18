import ValueWidget from "@/components/ValueWidget";
import HowItWorks from "@/components/HowItWorks";
import Compare from "@/components/Compare";
import GetPaid from "@/components/GetPaid";
import ReferralBanner from "@/components/ReferralBanner";
import Promise from "@/components/Testimonials";
import Faq from "@/components/Faq";
import TelLink from "@/components/TelLink";
import StickyCTA from "@/components/StickyCTA";
import { site } from "@/lib/site-config";
import { Check, Phone } from "@/components/icons";

export default function HomePage() {
  return (
    <>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden bg-cream">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative py-10 lg:py-14">
          {/* Mobile-only header — sits ABOVE the form so the headline reads first */}
          <div className="mb-6 animate-fade-up lg:hidden">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-navy shadow-soft">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-navy text-white">
                <Check className="h-3 w-3" />
              </span>
              Free estimate · we come to you
            </span>
            <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.05] tracking-tight text-navy sm:text-5xl">
              Sell your car the <span className="text-navy">easy way.</span>
            </h1>
          </div>

          <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            {/* LEFT — supporting copy (below the form on mobile, full column on desktop) */}
            <div className="order-2 animate-fade-up lg:order-1">
              {/* badge + headline repeat here for desktop only (mobile shows them above) */}
              <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-navy shadow-soft lg:inline-flex">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-navy text-white">
                  <Check className="h-3 w-3" />
                </span>
                Free estimate · we come to you
              </span>

              <h1 className="mt-5 hidden font-display text-[2rem] font-extrabold leading-[1.05] tracking-tight text-navy sm:text-6xl lg:block">
                Sell your car<br className="hidden sm:block" /> the <span className="text-navy">easy way.</span>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                A firm offer with no surprises — we come to you and pay on the spot.
              </p>

              <div className="mt-7 border-t border-slate-200 pt-6">
                <TelLink location="hero" className="group flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-navy transition group-hover:bg-slate-200">
                    <Phone className="h-5 w-5" />
                  </span>
                  <span className="leading-snug">
                    <span className="block font-semibold text-navy">
                      Prefer to talk? Call or text <span className="text-navy">{site.phoneDisplay}</span>
                    </span>
                    <span className="block text-base text-muted">We&apos;re available 24/7.</span>
                  </span>
                </TelLink>
              </div>
            </div>

            {/* RIGHT — the form is the hero (first on mobile) */}
            <div id="estimate" className="order-1 animate-fade-up scroll-mt-24 lg:order-2">
              <ValueWidget />
            </div>
          </div>
        </div>
      </section>

      <HowItWorks />

      <Compare />

      <GetPaid />

      <ReferralBanner />
      <Promise />
      <Faq />

      <StickyCTA />
    </>
  );
}
