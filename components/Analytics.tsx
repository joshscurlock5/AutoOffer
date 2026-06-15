"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}
