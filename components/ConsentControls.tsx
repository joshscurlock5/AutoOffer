"use client";

import { useEffect, useState } from "react";
import { consentChoice, setConsent, type ConsentChoice } from "@/lib/consent";

/**
 * The actual opt-out control — lives on the privacy page (linked from the
 * consent banner's "Privacy choices" and the footer), the same pattern large
 * sites use. Toggling reloads so the tracking scripts load/unload cleanly.
 */
export default function ConsentControls() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setChoice(consentChoice());
  }, []);

  if (!mounted) return null;
  const denied = choice === "denied";

  return (
    <div id="privacy-choices" className="mt-12 scroll-mt-24 rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <h2 className="font-display text-xl font-bold text-navy">Your privacy choices</h2>
      <p className="mt-2 leading-relaxed text-muted">
        Analytics and advertising measurement (Google Analytics, Meta, and Microsoft Clarity session
        recordings) {denied ? "are currently turned OFF in this browser." : "are currently on in this browser."}{" "}
        Your choice is remembered on this device.
      </p>
      <button
        type="button"
        onClick={() => {
          setConsent(denied ? "granted" : "denied");
          window.location.reload();
        }}
        className={
          denied
            ? "mt-4 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            : "mt-4 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-navy transition hover:bg-slate-100"
        }
      >
        {denied ? "Turn analytics back on" : "Turn off analytics & ad tracking"}
      </button>
    </div>
  );
}
