"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { ArrowRight, X } from "./icons";

/**
 * "Resume where you left off?" — surfaces the in-progress offer the app already
 * restores silently from localStorage (ao_offer_progress), so a returning visitor
 * is reactivated instead of starting over. Shown once per session on non-funnel
 * pages, only when there's meaningful progress and no completed lead.
 */
export default function ResumeBanner() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("ao_resume_dismissed")) return;
      const p = window.location.pathname;
      if (p.startsWith("/get-offer") || p.startsWith("/admin")) return;
      const s = JSON.parse(localStorage.getItem("ao_offer_progress") || "null");
      if (!s) return;
      const car = [s.year, s.make, s.model].filter(Boolean).join(" ");
      if (!car && !s.kmv) return; // nothing worth resuming
      setLabel(car || "your car");
      track("resume_shown");
    } catch {
      /* ignore */
    }
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem("ao_resume_dismissed", "1");
    } catch {
      /* ignore */
    }
    setLabel(null);
  }

  if (!label) return null;

  return (
    <div className="fixed left-1/2 top-20 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lift backdrop-blur">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">Pick up where you left off?</p>
          <p className="truncate text-xs text-muted">Your offer for {label} is a step away.</p>
        </div>
        <Link
          href="/get-offer?source=resume"
          onClick={() => {
            track("resume_clicked");
            dismiss();
          }}
          className="btn-primary shrink-0 px-4 py-2 text-sm"
        >
          Continue <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="icon-btn h-8 w-8 shrink-0 text-muted hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
