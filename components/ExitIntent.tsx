"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { site, telHref } from "@/lib/site-config";
import { X, ArrowRight, Phone, Tag } from "./icons";

/**
 * Subtle exit-intent reminder. Shown once per browser session on EVERY page
 * (except the admin panel and the offer flow itself).
 *  - Desktop: when the cursor leaves toward the top of the window.
 *  - Mobile/touch: when the visitor scrolls down then quickly back to the top
 *    (a safe "I'm leaving" signal — we don't hijack the back button).
 *
 * Preview it any time by adding ?exitpreview=1 to any URL.
 */
export default function ExitIntent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Preview override — shows it immediately on any page, every time.
    if (new URLSearchParams(window.location.search).has("exitpreview")) {
      setOpen(true);
      return;
    }

    if (sessionStorage.getItem("ao_exit_shown")) return;

    let done = false;
    const excluded = () => {
      const p = window.location.pathname;
      return p.startsWith("/admin") || p.startsWith("/get-offer");
    };
    const fire = () => {
      if (done || excluded()) return;
      done = true;
      setOpen(true);
      sessionStorage.setItem("ao_exit_shown", "1");
      cleanup();
    };

    // Don't fire in the first moment after load.
    let armed = false;
    const arm = setTimeout(() => {
      armed = true;
    }, 1200);

    // Desktop: cursor leaves the window via the top edge.
    const onMouseOut = (e: MouseEvent) => {
      if (armed && e.clientY <= 0 && !e.relatedTarget) fire();
    };
    document.addEventListener("mouseout", onMouseOut);

    // Mobile/touch: scrolled down, then scrolling back up toward the top.
    const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    let wentDown = false;
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > 500) wentDown = true;
      if (armed && wentDown && y < 140 && y < lastY) fire();
      lastY = y;
    };
    if (isTouch) window.addEventListener("scroll", onScroll, { passive: true });

    function cleanup() {
      clearTimeout(arm);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    }
    return cleanup;
  }, []);

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
