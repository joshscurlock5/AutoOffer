"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { consentChoice, setConsent } from "@/lib/consent";

/**
 * One-time analytics notice (opt-out model — see lib/consent.ts), styled the
 * way large sites do it: one short generic-purposes sentence + OK, with the
 * actual opt-out control one click away on the privacy page ("Privacy
 * choices", also permanently linked in the footer). Vendor names live in the
 * privacy policy.
 *
 * Positioning: on desktop it sits low (1rem) while the visitor is at the top of
 * the page, then rides up to sit ABOVE the sticky CTA pill the moment it appears
 * — anchored to the pill's TOP edge via --cta-pill-top (published + kept live by
 * StickyCTA). Anchoring to the top (not the center) is what keeps it clear when
 * a resize wraps the pill's label and makes it taller. On mobile it keeps its
 * spot above the sticky bar, with right-side clearance so it never covers the
 * chat bubble.
 */
export default function ConsentBanner() {
  const [show, setShow] = useState(false);

  // Decide after mount — localStorage doesn't exist during SSR/hydration.
  useEffect(() => {
    if (!consentChoice()) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-3 right-20 z-[70] transition-[bottom] duration-300 sm:right-auto sm:max-w-sm lg:bottom-[var(--cta-pill-top,1rem)] lg:left-1/2 lg:right-auto lg:max-w-xl lg:-translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 pl-4 shadow-lift">
        <p className="flex-1 text-[13px] leading-snug text-muted">
          We use cookies to improve your experience, analyze traffic, and personalize ads.{" "}
          <Link href="/privacy#privacy-choices" className="font-semibold text-brand-600 hover:underline">
            Privacy choices
          </Link>
        </p>
        <button
          type="button"
          onClick={() => {
            setConsent("granted");
            setShow(false);
          }}
          className="shrink-0 rounded-full bg-navy px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-navy-700"
        >
          OK
        </button>
      </div>
    </div>
  );
}
