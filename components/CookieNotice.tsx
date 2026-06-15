"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "ao_cookie_notice";

/**
 * Small, dismissible, non-blocking cookie/analytics notice (PIPEDA implied
 * consent — we do NOT gate GA on it). Sits above the StickyMobileBar on mobile.
 */
export default function CookieNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* private mode — just don't show */
    }
  }, []);

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
    <div className="fixed inset-x-0 bottom-20 z-30 px-3 lg:bottom-3">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm text-muted shadow-lift backdrop-blur sm:flex-row">
        <p className="flex-1 text-center sm:text-left">
          We use cookies and Google Analytics to understand how the site is used.{" "}
          <Link href="/privacy" className="font-semibold text-brand hover:underline">
            See our Privacy Policy
          </Link>
          .
        </p>
        <button onClick={dismiss} className="btn-primary shrink-0 px-6 py-2 text-sm">
          OK
        </button>
      </div>
    </div>
  );
}
