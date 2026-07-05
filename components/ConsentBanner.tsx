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
 * Positioning: on desktop it's centered at the very bottom while the visitor
 * is at the top of the page, then rides up above the sticky CTA pill the
 * moment it appears — driven by the SAME --cta-pill-center variable StickyCTA
 * publishes for the chat button, so all three stay in lock-step (unset ⇒
 * -1.5rem + 2.5rem = 1rem from the bottom; set ⇒ just above the pill). On
 * mobile it keeps its spot above the sticky bar, with right-side clearance so
 * it never covers the chat bubble.
 */
export default function ConsentBanner() {
  const [show, setShow] = useState(false);

  // Decide after mount — localStorage doesn't exist during SSR/hydration.
  useEffect(() => {
    if (!consentChoice()) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-3 right-20 z-[70] transition-[bottom] duration-300 sm:right-auto sm:max-w-sm lg:bottom-[calc(var(--cta-pill-center,-1.5rem)+2.5rem)] lg:left-1/2 lg:right-auto lg:max-w-xl lg:-translate-x-1/2">
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
          className="shrink-0 rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          OK
        </button>
      </div>
    </div>
  );
}
