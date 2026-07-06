"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { site, telHref } from "@/lib/site-config";
import { track, trackPhoneClick } from "@/lib/analytics";
import { getAttribution, getBehavior, getTouches } from "@/lib/attribution";
import { X, ArrowRight, Phone } from "./icons";

/**
 * Exit-intent reminder. Shown once per browser session on deeper pages (NOT the
 * homepage — the estimate form already lives there — nor the admin panel or the
 * offer flow). Desktop fires on a top-edge cursor exit; touch devices fire on a
 * fast scroll back toward the top after the visitor has scrolled down (a leaving
 * signal). Besides the CTA + phone, it captures an EMAIL so a hesitant visitor is
 * reachable — the address is beaconed to /api/leads/partial as an abandoned cart.
 *
 * Preview it any time by adding ?exitpreview=1 to any URL.
 */
export default function ExitIntent() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (new URLSearchParams(window.location.search).has("exitpreview")) {
      setOpen(true);
      return;
    }
    if (sessionStorage.getItem("ao_exit_shown")) return;

    let done = false;
    const excluded = () => {
      const p = window.location.pathname;
      return p === "/" || p.startsWith("/admin") || p.startsWith("/get-offer");
    };
    const fire = () => {
      if (done || excluded()) return;
      done = true;
      setOpen(true);
      track("exit_intent_shown");
      sessionStorage.setItem("ao_exit_shown", "1");
      cleanup();
    };

    let armed = false;
    const arm = setTimeout(() => {
      armed = true;
    }, 1200);

    // Desktop: cursor leaves the window via the top edge.
    const onMouseOut = (e: MouseEvent) => {
      if (armed && e.clientY <= 0 && !e.relatedTarget) fire();
    };
    document.addEventListener("mouseout", onMouseOut);

    // Touch: scrolled down meaningfully, then jumps back toward the top (leaving).
    const isTouch = window.matchMedia?.("(pointer: coarse)").matches;
    let lastY = window.scrollY;
    let maxY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      maxY = Math.max(maxY, y);
      if (armed && maxY > 500 && y < 120 && lastY - y > 40) fire();
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

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
    setSent(true);
    track("exit_intent_email_captured");
    try {
      fetch("/api/leads/partial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: value,
          contactMethod: "email",
          attribution: getAttribution(),
          touches: getTouches(),
          behavior: getBehavior(),
        }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white p-7 text-center shadow-lift">
        <button
          onClick={() => {
            track("exit_intent_dismissed");
            setOpen(false);
          }}
          aria-label="Close"
          className="icon-btn absolute right-3 top-3 h-9 w-9 text-muted hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-5xl leading-none" role="img" aria-label="Waving hand">👋</div>
        <p className="mt-4 text-sm font-medium text-muted">Before you go…</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-navy">
          Get your free, no-obligation offer.
        </h2>

        <Link
          href="/get-offer?source=exit_intent"
          onClick={() => {
            track("exit_intent_clicked");
            setOpen(false);
          }}
          className="btn-primary mt-5 w-full text-lg"
        >
          Get a Free Offer <ArrowRight className="h-5 w-5" />
        </Link>

        <div className="mt-4 border-t border-slate-100 pt-4">
          {sent ? (
            <p className="text-sm font-semibold text-emerald-700">
              Thanks! We&apos;ll email your offer shortly.
            </p>
          ) : (
            <form onSubmit={submitEmail}>
              <p className="mb-2 text-sm text-muted">Prefer we email it to you?</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                  className="field flex-1"
                />
                <button type="submit" className="btn-primary shrink-0 px-4">
                  Send
                </button>
              </div>
            </form>
          )}
        </div>

        <a
          href={telHref}
          onClick={() => trackPhoneClick("exit_intent")}
          className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-brand hover:underline"
        >
          <Phone className="h-4 w-4" /> Or call / text {site.phoneDisplay}
        </a>
      </div>
    </div>
  );
}
