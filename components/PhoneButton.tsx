"use client";

import { site, telHref } from "@/lib/site-config";
import { trackPhoneClick } from "@/lib/analytics";
import { Phone } from "./icons";

/** A click-to-call button. Variants match the global button styles. */
export default function PhoneButton({
  variant = "primary",
  showLabel = true,
  label,
  className = "",
  location = "phone_button",
}: {
  variant?: "primary" | "dark" | "accent" | "ghost" | "white";
  showLabel?: boolean;
  /** Custom button text (defaults to the phone number). */
  label?: string;
  className?: string;
  /** GA4 phone_click source label. */
  location?: string;
}) {
  const map: Record<string, string> = {
    primary: "btn-primary",
    dark: "btn-dark",
    accent: "btn-accent",
    ghost: "btn-ghost",
    white: "btn bg-white text-brand px-6 py-3 hover:bg-brand-50 shadow-soft",
  };
  return (
    <a
      href={telHref}
      className={`${map[variant]} ${className}`}
      onClick={() => trackPhoneClick(location)}
    >
      <Phone className="h-5 w-5" />
      {showLabel ? <span>{label ?? site.phoneDisplay}</span> : null}
    </a>
  );
}
