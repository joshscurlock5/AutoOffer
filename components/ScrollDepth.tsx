"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

const THRESHOLDS = [25, 50, 75, 100];

/**
 * Fires GA4 `scroll_depth` once as the reader passes 25/50/75/100% of the page.
 * Mounted on long-form content (guide articles) to see how far people read before
 * clicking a CTA. Renders nothing; no-op until gtag exists.
 */
export default function ScrollDepth({ slug }: { slug?: string }) {
  const fired = useRef<Set<number>>(new Set());

  useEffect(() => {
    function onScroll() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const pct = (window.scrollY / scrollable) * 100;
      for (const t of THRESHOLDS) {
        if (pct >= t && !fired.current.has(t)) {
          fired.current.add(t);
          track("scroll_depth", slug ? { percent: t, slug } : { percent: t });
        }
      }
    }
    onScroll(); // short pages may already be fully visible
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [slug]);

  return null;
}
