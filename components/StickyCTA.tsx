"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { site, telHref } from "@/lib/site-config";
import { trackPhoneClick } from "@/lib/analytics";
import { ArrowRight, Phone } from "./icons";
import OfferCtaLink from "@/components/OfferCtaLink";

/**
 * Floating desktop pill (lg+ only — the mobile sticky bar covers small screens,
 * so only ever one is visible). Hidden at the top of the page; slides up once the
 * visitor scrolls past the How It Works section (#how).
 */
export default function StickyCTA() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const hideBar = pathname?.startsWith("/admin") || pathname?.startsWith("/get-offer");

  useEffect(() => {
    if (hideBar) {
      setShow(false);
      return;
    }
    const form = document.getElementById("estimate");
    if (!form) {
      // Pages without the estimate form (referral, guides, etc.): show the pill
      // immediately, mirroring the mobile bar — so the lifted cookie notice has
      // the CTA beneath it instead of a gap.
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(form);
    return () => io.disconnect();
  }, [pathname, hideBar]);

  // Publish the pill's CENTERLINE so the floating chat button lines up with it.
  // Deliberately NOT gated on `show`: the pill is always laid out on lg (it only
  // fades/slides via opacity+transform), so its measured centre is constant and
  // the chat button holds a stable position instead of animate-chasing the pill's
  // scroll show/hide (the jitter). Cleared on the offer flow / admin (hideBar) and
  // below lg (offsetParent null → the pill is display:none and the mobile bar rules).
  // ResizeObserver keeps it correct if the label wraps and grows the pill.
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty("--cta-pill-center");
    const el = pillRef.current;
    if (hideBar || !el) {
      clear();
      return clear;
    }
    const apply = () => {
      if (el.offsetParent === null) { clear(); return; }
      root.style.setProperty("--cta-pill-center", `calc(1.5rem + ${el.offsetHeight / 2}px)`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      clear();
    };
  }, [hideBar]);

  // Publish the pill's TOP edge + a gap so the cookie notice sits fully ABOVE it.
  // This one IS gated on `show`: the notice should ride down to the corner when the
  // pill is hidden rather than reserve empty space above a pill that isn't there.
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty("--cta-pill-top");
    const el = pillRef.current;
    if (!show || !el || el.offsetParent === null) {
      clear();
      return clear;
    }
    const apply = () => root.style.setProperty("--cta-pill-top", `calc(1.5rem + ${el.offsetHeight}px + 0.75rem)`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      clear();
    };
  }, [show]);

  if (hideBar) return null;

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-6 z-40 hidden justify-center px-4 transition-all duration-300 lg:flex ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <div ref={pillRef} className="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-2 pl-7 pr-2 shadow-lift">
        <p className="text-base font-semibold text-navy">
          DriveOffer will buy your car
        </p>
        <OfferCtaLink
          location="sticky_desktop"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-2.5 text-base font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-700"
        >
          Get a Free Offer <ArrowRight className="h-4 w-4" />
        </OfferCtaLink>
        <a
          href={telHref}
          onClick={() => trackPhoneClick("sticky_desktop")}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-base font-semibold text-navy transition hover:border-navy"
        >
          <Phone className="h-4 w-4" /> Call or text {site.phoneDisplay}
        </a>
      </div>
    </div>
  );
}
