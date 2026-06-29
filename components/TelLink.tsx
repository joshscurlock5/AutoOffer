"use client";

import { telHref } from "@/lib/site-config";
import { trackPhoneClick } from "@/lib/analytics";

/**
 * A click-to-call <a> that fires a GA4 `phone_click` event with a `location`
 * label. Use this for tel: links inside Server Components (which can't attach
 * an onClick directly). Client components can just add the onClick inline.
 */
export default function TelLink({
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
      href={telHref}
      aria-label={ariaLabel}
      className={className}
      onClick={() => trackPhoneClick(location)}
    >
      {children}
    </a>
  );
}
