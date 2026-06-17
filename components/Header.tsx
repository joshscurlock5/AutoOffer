"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { site, telHref } from "@/lib/site-config";
import { track } from "@/lib/analytics";
import { Phone, Menu, X, ArrowRight } from "./icons";

const NAV = [
  { href: "/#how", label: "How It Works" },
  { href: "/about", label: "About Us" },
  { href: "/referral", label: "Refer & Earn $100" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Slim header on the admin panel.
  const isAdmin = pathname?.startsWith("/admin");

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-colors ${
        scrolled
          ? "border-slate-200 bg-white/95 backdrop-blur"
          : "border-transparent bg-white"
      }`}
    >
      <div className="container-x flex h-[72px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2" aria-label={site.name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DriveOffer" className="h-9 w-auto" />
          <span className="font-display text-xl font-extrabold tracking-tight text-navy">
            Drive<span className="text-brand">Offer</span>
          </span>
        </Link>

        {!isAdmin && (
          <nav className="hidden items-center gap-7 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="text-sm font-medium text-navy/80 transition hover:text-brand"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={telHref}
            onClick={() => track("phone_click", { location: "header_desktop" })}
            className="group flex items-center gap-2 rounded-full px-3 py-2 text-navy transition hover:text-brand"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand transition group-hover:bg-brand group-hover:text-white">
              <Phone className="h-4 w-4" />
            </span>
            <span className="text-left leading-tight">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">
                Call or text now
              </span>
              <span className="block text-sm font-bold">{site.phoneDisplay}</span>
            </span>
          </a>
          {!isAdmin && (
            <Link href="/get-offer" className="btn-primary">
              Get My Estimate
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="icon-btn h-11 w-11 border border-slate-200 text-navy lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" role="navigation" aria-label="Mobile menu" className="border-t border-slate-200 bg-white lg:hidden">
          <div className="container-x flex flex-col gap-1 py-4">
            {!isAdmin &&
              NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-lg px-3 py-3 text-base font-medium text-navy hover:bg-brand-50"
                >
                  {n.label}
                </Link>
              ))}
            <div className="mt-3 flex flex-col gap-2">
              <a href={telHref} onClick={() => track("phone_click", { location: "header_mobile" })} className="btn-dark w-full">
                <Phone className="h-5 w-5" />
                {site.phoneDisplay}
              </a>
              {!isAdmin && (
                <Link href="/get-offer" className="btn-primary w-full">
                  Get My Estimate
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
