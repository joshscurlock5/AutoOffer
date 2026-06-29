"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { track } from "@/lib/analytics";

type LinkProps = ComponentProps<typeof Link>;

type ReferralCtaLinkProps = Omit<LinkProps, "href"> & {
  /** Destination (defaults to the referral page). */
  href?: LinkProps["href"];
  /** GA4 `referral_cta_click` location label. */
  location: string;
};

/**
 * A "Refer & Earn" CTA that fires GA4 `referral_cta_click` (the first step of the
 * referral funnel). Safe in Server Components — same boundary pattern as
 * <OfferCtaLink/>. Composes any onClick the caller passes.
 */
export default function ReferralCtaLink({
  href = "/referral",
  location,
  onClick,
  children,
  ...rest
}: ReferralCtaLinkProps) {
  return (
    <Link
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        track("referral_cta_click", { location });
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
