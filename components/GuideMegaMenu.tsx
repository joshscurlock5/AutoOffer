"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { guideCategories, getArticle, type FlatArticle } from "@/lib/guides";
import { Car, Banknote, MapPin, Tag, Sparkles, ChevronDown, ChevronRight, ArrowRight } from "./icons";

type IconType = ComponentType<{ className?: string }>;

// Icons are only used by the mobile accordion now — the desktop menu is text-first.
const CAT_ICON: Record<string, IconType> = {
  selling: Car,
  payment: Banknote,
  areas: MapPin,
  value: Tag,
  more: Sparkles,
};

// "More Resources" points at existing pages (not guide articles), which also
// keeps About/Contact reachable now that they've left the top nav.
const MORE_RESOURCES = {
  key: "more",
  title: "More Resources",
  links: [
    { label: "How It Works", href: "/#how" },
    { label: "About DriveOffer", href: "/about" },
    { label: "Refer & Earn $100", href: "/referral" },
    { label: "Contact Us", href: "/contact" },
  ],
};

// The left rail = the four guide categories + More Resources.
const RAIL = [...guideCategories.map((c) => ({ key: c.key, title: c.title })), { key: MORE_RESOURCES.key, title: MORE_RESOURCES.title }];

// Hand-picked cross-category "popular" links for the right-hand resource box.
const POPULAR: FlatArticle[] = [
  "sell-my-car-edmonton",
  "how-to-sell-a-car-in-alberta",
  "selling-a-car-with-a-loan",
  "how-bank-draft-payment-works",
  "what-affects-your-cars-value",
]
  .map((slug) => getArticle(slug))
  .filter((a): a is FlatArticle => Boolean(a));

function categoryLinks(key: string) {
  if (key === "more") return MORE_RESOURCES.links;
  const cat = guideCategories.find((c) => c.key === key);
  if (!cat) return [];
  return cat.articles.map((a) => ({ label: a.title, href: `/car-selling-guide/${a.slug}` }));
}

/* ========================================================================== *
 *  Desktop mega menu (xl+) — editorial, resource-first
 * ========================================================================== */
export function GuideMegaMenu() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(RAIL[0].key);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const links = categoryLinks(active);
  const activeTitle = RAIL.find((r) => r.key === active)?.title ?? "";

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[15px] font-medium text-navy/80 transition hover:text-brand"
        aria-haspopup="true"
        aria-expanded={open}
      >
        Car Selling Guide
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        // pt-3 bridges the gap to the trigger so hover doesn't drop between them.
        <div className="absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3">
          <div className="w-[min(66rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(16,42,76,0.28)]">
            <div className="grid grid-cols-[230px_minmax(0,1fr)_290px]">
              {/* Left rail — text-first categories */}
              <nav className="border-r border-slate-100 p-4">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Browse by topic
                </p>
                <ul className="space-y-0.5">
                  {RAIL.map((r) => {
                    const isActive = r.key === active;
                    return (
                      <li key={r.key}>
                        <button
                          type="button"
                          onMouseEnter={() => setActive(r.key)}
                          onFocus={() => setActive(r.key)}
                          onClick={() => setActive(r.key)}
                          aria-current={isActive}
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[15px] transition ${
                            isActive
                              ? "bg-slate-100 font-semibold text-navy"
                              : "font-medium text-navy/70 hover:bg-slate-50 hover:text-navy"
                          }`}
                        >
                          <span>{r.title}</span>
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 text-slate-400 transition ${isActive ? "opacity-100" : "opacity-0"}`}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {/* Middle — clean link list for the active category */}
              <div className="px-7 py-6">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{activeTitle}</p>
                <ul className="space-y-1">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setOpen(false)}
                        className="block py-1.5 text-[15px] font-medium leading-snug text-navy/80 transition hover:text-brand"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                {active !== "more" && (
                  <Link
                    href={`/car-selling-guide#${active}`}
                    onClick={() => setOpen(false)}
                    className="mt-5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:text-brand-700"
                  >
                    View all {activeTitle.toLowerCase()} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>

              {/* Right — neutral "featured" resource box (blue reserved for links) */}
              <div className="p-4">
                <div className="h-full rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-slate-500">
                    Popular Car Selling Guides
                  </p>
                  <ul className="mt-3.5 space-y-0.5">
                    {POPULAR.map((a) => (
                      <li key={a.slug}>
                        <Link
                          href={`/car-selling-guide/${a.slug}`}
                          onClick={() => setOpen(false)}
                          className="group flex items-start gap-2 py-1.5 text-[14px] font-medium leading-snug text-navy/80 transition hover:text-brand-700"
                        >
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-brand-600" />
                          <span>{a.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <Link
                      href="/car-selling-guide"
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:text-brand"
                    >
                      See all guides <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== *
 *  Mobile accordion (inside the hamburger, below xl)
 * ========================================================================== */
export function GuideMobileAccordion({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [openCat, setOpenCat] = useState<string | null>(null);

  return (
    <div className="rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-base font-medium text-navy hover:bg-slate-100"
        aria-expanded={open}
      >
        Car Selling Guide
        <ChevronDown className={`h-5 w-5 text-navy/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="ml-2 border-l border-slate-200 pl-2">
          {RAIL.map((r) => {
            const isCatOpen = openCat === r.key;
            const links = categoryLinks(r.key);
            const Icon = CAT_ICON[r.key];
            return (
              <div key={r.key}>
                <button
                  type="button"
                  onClick={() => setOpenCat(isCatOpen ? null : r.key)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold text-navy hover:bg-slate-100"
                  aria-expanded={isCatOpen}
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1">{r.title}</span>
                  <ChevronDown className={`h-4 w-4 text-navy/40 transition-transform ${isCatOpen ? "rotate-180" : ""}`} />
                </button>
                {isCatOpen && (
                  <ul className="mb-1 ml-7 space-y-0.5">
                    {links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={onNavigate}
                          className="block rounded-lg px-3 py-2 text-[15px] text-navy/80 hover:bg-slate-100 hover:text-brand"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <Link
            href="/car-selling-guide"
            onClick={onNavigate}
            className="mt-1 flex items-center gap-1 px-3 py-2.5 text-[15px] font-semibold text-brand hover:text-brand-700"
          >
            Browse the full guide <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
