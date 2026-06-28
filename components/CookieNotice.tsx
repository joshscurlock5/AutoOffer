"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "ao_cookie_notice";

/**
 * Small, dismissible, non-blocking cookie/analytics notice (PIPEDA implied
 * consent — we do NOT gate GA on it). Sits in the bottom-left, beside (not under)
 * the chat button, and lifts above the sticky CTA bar once it appears on scroll —
 * the same trigger the bars use (`#estimate` scrolled out of view).
 */
export default function CookieNotice() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* private mode — just don't show */
    }
  }, []);

  // Mirror the CTA bars: low at the top of the page, lifted once scrolled past
  // the estimate form (on pages without it the bars show immediately).
  useEffect(() => {
    const form = document.getElementById("estimate");
    if (!form) {
      setScrolled(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => setScrolled(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(form);
    return () => io.disconnect();
  }, [pathname]);

  if (!show) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div
      className={`cookie-notice fixed left-3 right-3 z-30 lg:left-0 lg:right-0 lg:px-4 ${
        scrolled ? "lg:bottom-24" : "lg:bottom-6"
      }`}
    >
      <div className="mx-auto flex max-w-3xl flex-row items-center gap-2.5 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-muted shadow-lift backdrop-blur sm:gap-3 sm:px-4 sm:py-3 sm:text-sm">
        <p className="min-w-0 flex-1 truncate text-left sm:overflow-visible sm:whitespace-normal">
          We use cookies and Google Analytics to understand how the site is used.
        </p>
        <button onClick={dismiss} className="btn-primary shrink-0 px-4 py-1.5 text-xs sm:px-6 sm:py-2 sm:text-sm">
          OK
        </button>
      </div>
    </div>
  );
}
