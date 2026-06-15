"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { site, telHref } from "@/lib/site-config";
import { Phone } from "./icons";

/**
 * Floating click-to-call button. Hidden near the top of the page (the hero
 * already has a "Call Now" button there) and slides in once the user scrolls
 * past the hero — keeps the first screen uncluttered on mobile.
 */
export default function FloatingCall() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname?.startsWith("/admin")) return null;

  return (
    <a
      href={telHref}
      aria-label={`Call ${site.phoneDisplay}`}
      className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand px-4 py-4 text-white shadow-lift transition-all duration-300 hover:scale-105 hover:bg-brand-600 active:scale-95 sm:px-5 ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      <Phone className="h-6 w-6" />
      <span className="hidden font-bold sm:inline">Call or Text</span>
    </a>
  );
}
