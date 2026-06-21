"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { telHref } from "@/lib/site-config";
import { track } from "@/lib/analytics";
import { ArrowRight, Phone } from "./icons";

/**
 * Mobile-only sticky bottom CTA bar (below lg — the desktop pill covers large
 * screens, so only ever one is visible). On the homepage it appears once the
 * visitor scrolls past the How It Works section (#how); on other pages (no #how)
 * it shows immediately. Hidden on the offer flow / admin.
 */
export default function StickyMobileBar() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const hideBar = pathname?.startsWith("/admin") || pathname?.startsWith("/get-offer");

  useEffect(() => {
    const form = document.getElementById("estimate");
    if (!form) {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(form);
    return () => io.disconnect();
  }, [pathname]);

  // Publish the bar's live height so the floating chat button can sit above it
  // while it's up and drop back to the corner when it's down. Cleared whenever
  // the bar isn't rendered/visible so the chat button falls back to the corner.
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty("--mobile-cta-bar");
    if (hideBar || !show) {
      clear();
      return clear;
    }
    const el = barRef.current;
    if (!el) return clear;
    const apply = () => root.style.setProperty("--mobile-cta-bar", `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      clear();
    };
  }, [show, hideBar]);

  if (hideBar) {
    return null;
  }

  // On the homepage the estimate form is already on the page — scroll to it
  // instead of routing to a fresh, empty copy of the same form.
  const onHome = pathname === "/";

  return (
    <div
      ref={barRef}
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-8px_24px_-12px_rgba(16,42,76,0.25)] backdrop-blur transition-transform duration-300 lg:hidden ${
        show ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-2.5">
        {onHome ? (
          <a href="#estimate" className="btn-primary flex-1 py-3">
            Get My Estimate <ArrowRight className="h-4 w-4" />
          </a>
        ) : (
          <Link href="/get-offer" className="btn-primary flex-1 py-3">
            Get My Estimate <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        <a
          href={telHref}
          onClick={() => track("phone_click", { location: "sticky_mobile" })}
          aria-label="Call or text us"
          className="btn shrink-0 border-2 border-brand-600 bg-white px-5 py-3 text-brand-700 active:bg-brand-50"
        >
          <Phone className="h-5 w-5" /> Call
        </a>
      </div>
    </div>
  );
}
