"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Hides public-website chrome on the admin panel. `/admin` is a tool, not a
 * place to browse the marketing site, so things like the site footer don't
 * belong there. Renders children on every other route.
 *
 * Children are passed in (not imported) so a server component like <Footer/>
 * stays a server component — this gate only decides whether to render it.
 */
export default function HideOnAdmin({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
