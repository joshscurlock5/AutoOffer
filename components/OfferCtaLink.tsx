"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { trackCtaClick } from "@/lib/analytics";

type LinkProps = ComponentProps<typeof Link>;

type OfferCtaLinkProps = Omit<LinkProps, "href"> & {
  /** Destination. Defaults to the offer flow; may already carry query (e.g. ?make=Toyota). */
  href?: LinkProps["href"];
  /** GA4 `cta_click` location label, also stamped onto the destination as ?source=. */
  location: string;
};

/**
 * A tracked CTA into the offer flow. Fires GA4 `cta_click` on click (so the
 * click→page-load drop-off is measurable) and merges `?source=<location>` into
 * the destination query WITHOUT clobbering existing params like ?make=. Safe to
 * render inside Server Components — same boundary pattern as <TelLink/>. Forwards
 * className/children/etc. and composes any onClick the caller passes.
 */
export default function OfferCtaLink({
  href = "/get-offer",
  location,
  onClick,
  children,
  ...rest
}: OfferCtaLinkProps) {
  return (
    <Link
      href={withSource(href, location)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        trackCtaClick(location);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}

/**
 * Merge `source` into a path's query string without disturbing existing params.
 * Only handles string hrefs (every offer CTA uses a string path); a non-string
 * UrlObject is passed through untouched.
 */
function withSource(href: LinkProps["href"], source: string): LinkProps["href"] {
  if (typeof href !== "string") return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  if (!params.has("source")) params.set("source", source);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
