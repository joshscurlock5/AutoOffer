"use client";

import { mailHref } from "@/lib/site-config";
import { track } from "@/lib/analytics";

/**
 * A mailto <a> that fires a GA4 `email_click` event with a `location` label.
 * Mirrors <TelLink/> for email links inside Server Components (which can't
 * attach an onClick directly).
 */
export default function EmailLink({
  location,
  className = "",
  ariaLabel,
  children,
}: {
  location: string;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={mailHref}
      aria-label={ariaLabel}
      className={className}
      onClick={() => track("email_click", { location })}
    >
      {children}
    </a>
  );
}
