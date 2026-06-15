"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { site, telHref } from "@/lib/site-config";
import { X, ArrowRight, Phone, Tag } from "./icons";

/**
 * Subtle exit-intent reminder. Fires once per browser session when the cursor
 * leaves toward the top of the window (the classic "about to close the tab"
 * signal). Skipped on the offer funnel and admin.
 *
 * To preview it any time, visit any page with ?exitpreview=1
 * (e.g. https://your-site/?exitpreview=1).
 */
export default function ExitIntent() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname?.startsWith("/admin") || pathname?.startsWith("/get-offer")) return;

    // Preview override: ?exitpreview=1 shows it immediately, every time.
    if (new URLSearchParams(window.location.search).has("exitpreview")) {
      setOpen(true);
      return;
    }

    if (sessionStorage.getItem("ao_exit_shown")) return;

    let armed = false;
    const arm = setTimeout(() => {
      armed = true;
    }, 1200);

    const onMouseOut = (e: MouseEvent) => {
      if (!armed) return;
      // Fired only when the cursor actually leaves the window via the top.
      if (e.clientY <= 0 && !e.relatedTarget) {
        setOpen(true);
        sessionStorage.setItem("ao_exit_shown", "1");
        document.removeEventListener("mouseout", onMouseOut);
      }
    };
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      clearTimeout(arm);
      document.removeEventListener("mouseout", onMouseOut);
    };
  }, [pathname]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-7 shadow-lift">
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="icon-btn absolute right-3 top-3 h-9 w-9 text-muted hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand">
          <Tag className="h-4 w-4" /> Before you go
        </span>
        <h2 className="mt-3 font-display text-2xl font-bold text-navy">
          See what your car is worth — free
        </h2>
        <p className="mt-2 text-muted">
          It takes about two minutes to get an instant estimate. No obligation, no
          spam — and a real {site.name} buyer confirms your firm offer.
        </p>
        <Link href="/get-offer" onClick={() => setOpen(false)} className="btn-primary mt-5 w-full text-lg">
          Get My Free Estimate <ArrowRight className="h-5 w-5" />
        </Link>
        <a
          href={telHref}
          className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-brand hover:underline"
        >
          <Phone className="h-4 w-4" /> Or call / text {site.phoneDisplay}
        </a>
      </div>
    </div>
  );
}
