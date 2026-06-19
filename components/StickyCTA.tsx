"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { site, telHref } from "@/lib/site-config";
import { track } from "@/lib/analytics";
import { ArrowRight, Phone } from "./icons";

/**
 * Floating desktop pill (lg+ only — the mobile sticky bar covers small screens,
 * so only ever one is visible). Hidden at the top of the page; slides up once the
 * visitor scrolls past the How It Works section (#how).
 */
export default function StickyCTA() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const form = document.getElementById("estimate");
    if (!form) return;
    const io = new IntersectionObserver(
      ([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    io.observe(form);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-6 z-40 hidden justify-center px-4 transition-all duration-300 lg:flex ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white py-2 pl-7 pr-2 shadow-lift">
        <p className="text-base font-semibold text-navy">
          DriveOffer will buy your car right now
        </p>
        <Link
          href="/get-offer"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 py-2.5 text-base font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-700"
        >
          Get my free estimate <ArrowRight className="h-4 w-4" />
        </Link>
        <a
          href={telHref}
          onClick={() => track("phone_click", { location: "sticky_desktop" })}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-base font-semibold text-navy transition hover:border-navy"
        >
          <Phone className="h-4 w-4" /> Call or text {site.phoneDisplay}
        </a>
      </div>
    </div>
  );
}
