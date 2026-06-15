"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { telHref } from "@/lib/site-config";
import { track } from "@/lib/analytics";
import { ArrowRight, Phone } from "./icons";

/**
 * Mobile-only sticky bottom CTA bar: a primary "Get Estimate" button and a
 * smaller "Call" button. Replaces the floating phone button + the big stacked
 * hero buttons on phones. Hidden on desktop (the sticky header covers CTAs
 * there) and on the offer flow / admin (which have their own actions).
 */
export default function StickyMobileBar() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/get-offer")) {
    return null;
  }

  // On the homepage the estimate form is already on the page — scroll to it
  // instead of routing to a fresh, empty copy of the same form.
  const onHome = pathname === "/";

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-8px_24px_-12px_rgba(16,41,30,0.25)] backdrop-blur lg:hidden"
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
          className="btn shrink-0 border-2 border-brand bg-white px-5 py-3 text-brand active:bg-brand-50"
        >
          <Phone className="h-5 w-5" /> Call
        </a>
      </div>
    </div>
  );
}
