"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { site, telHref } from "@/lib/site-config";
import { Phone } from "./icons";

/** Floating click-to-call button — pulses briefly on arrival, then rests. */
export default function FloatingCall() {
  const pathname = usePathname();
  const [ping, setPing] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setPing(false), 4500);
    return () => clearTimeout(t);
  }, []);

  if (pathname?.startsWith("/admin")) return null;

  return (
    <a
      href={telHref}
      aria-label={`Call ${site.phoneDisplay}`}
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand px-4 py-4 text-white shadow-lift transition hover:scale-105 hover:bg-brand-600 active:scale-95 sm:px-5"
    >
      {ping && (
        <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-brand/40 motion-reduce:hidden" />
      )}
      <Phone className="h-6 w-6" />
      <span className="hidden font-bold sm:inline">Call or Text</span>
    </a>
  );
}
