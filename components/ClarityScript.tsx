"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { consentDenied } from "@/lib/consent";
import { getBehavior } from "@/lib/attribution";

/**
 * Microsoft Clarity session recordings + heatmaps. Injected only when
 * NEXT_PUBLIC_CLARITY_ID is set AND the visitor hasn't opted out via the
 * consent banner. Every page is identified with our first-party sessionId
 * (the same one stored on leads as behavior.sessionId), so a lead's replays
 * are findable in Clarity via Filters → Custom user ID. Default input
 * masking stays ON — Clarity never records what people type.
 */

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID || "";

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

export default function ClarityScript() {
  const pathname = usePathname();

  // Inject the tag once (client-only — consent lives in localStorage).
  useEffect(() => {
    if (!CLARITY_ID || consentDenied()) return;
    if (document.getElementById("ms-clarity")) return;
    // Queue shim (Clarity's standard bootstrap): calls made before the tag
    // loads are buffered and replayed by the real script.
    if (!window.clarity) {
      const shim: ClarityFn = (...args: unknown[]) => {
        (shim.q = shim.q || []).push(args);
      };
      window.clarity = shim;
    }
    const s = document.createElement("script");
    s.id = "ms-clarity";
    s.async = true;
    s.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
    document.head.appendChild(s);
  }, []);

  // (Re-)identify on every route change so each page of the session is tagged.
  useEffect(() => {
    if (!CLARITY_ID || consentDenied()) return;
    const sid = getBehavior().sessionId;
    if (sid && typeof window.clarity === "function") window.clarity("identify", sid);
  }, [pathname]);

  return null;
}
