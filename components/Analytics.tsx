"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureFirstTouch } from "@/lib/attribution";
import { logEvent } from "@/lib/events";

/**
 * Fires a GA4 page_view on every client-side route change. App Router SPA
 * navigations (<Link>/router.push) do NOT trigger a page_view automatically —
 * the layout init sets send_page_view:false, so this is the single source of
 * page_view truth (including the first render). Must be rendered inside a
 * <Suspense> boundary because it reads useSearchParams().
 */
export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // First-touch attribution + behavior counters (safe no-op without storage).
    captureFirstTouch();
    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;
    // First-party page_view (page_view is fired via raw gtag below, not track(),
    // so the events-table tee needs its own call here).
    logEvent("page_view", { page_path: path });
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: path,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
    // Meta Pixel page view (the base loader fires init only).
    if (typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [pathname, searchParams]);

  // Capture the Meta click id (fbclid) into a first-party _fbc cookie when the
  // Pixel hasn't already set one. This preserves the strongest CAPI match signal
  // even for Safari/iOS/ad-blocked visitors where fbevents.js never runs — the
  // server reads this cookie when sending the Conversions API Lead. If a _fbc
  // already exists, only overwrite it when the URL's fbclid is a DIFFERENT click
  // than the one baked into the cookie (a new ad click arrived) — an identical
  // fbclid leaves the cookie alone so the original click timestamp is preserved.
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const fbclid = searchParams?.get("fbclid");
    if (!fbclid) return;
    const existing = document.cookie
      .split("; ")
      .find((c) => c.startsWith("_fbc="))
      ?.slice("_fbc=".length);
    // fb.1.<ts>.<fbclid> — the fbclid segment is everything after the 3rd dot.
    const existingFbclid = existing ? existing.split(".").slice(3).join(".") : "";
    if (existing && existingFbclid === fbclid) return;
    const fbc = `fb.1.${Date.now()}.${fbclid}`;
    // 90-day first-party cookie (matches Meta's _fbc lifetime).
    document.cookie = `_fbc=${fbc}; path=/; max-age=7776000; SameSite=Lax`;
  }, [searchParams]);

  return null;
}
