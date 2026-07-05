"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { consentChoice, setConsent } from "@/lib/consent";

/**
 * One-time analytics notice (opt-out model — see lib/consent.ts). Shows until
 * the visitor picks either button; "Turn off analytics" stores the denial and
 * reloads so no further analytics runs this session. Sits above the mobile
 * sticky bar (bottom-20) and drops to the true bottom on desktop.
 */
export default function ConsentBanner() {
  const [show, setShow] = useState(false);

  // Decide after mount — localStorage doesn't exist during SSR/hydration.
  useEffect(() => {
    if (!consentChoice()) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-[70] px-3 pb-3 lg:bottom-0">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lift sm:flex-row sm:items-center">
        <p className="flex-1 text-sm leading-relaxed text-muted">
          We use cookies and analytics — Google Analytics, Meta ads measurement, and Microsoft
          Clarity session recordings — to improve the site and measure our ads.{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 hover:underline">
            Privacy Policy
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setConsent("denied");
              window.location.reload();
            }}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted transition hover:bg-slate-100"
          >
            Turn off analytics
          </button>
          <button
            type="button"
            onClick={() => {
              setConsent("granted");
              setShow(false);
            }}
            className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
