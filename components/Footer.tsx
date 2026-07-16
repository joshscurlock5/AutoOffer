import Link from "next/link";
import { site, fullAddress, mailHref } from "@/lib/site-config";
import TelLink from "./TelLink";
import OfferCtaLink from "@/components/OfferCtaLink";
import { Phone, Mail, MapPin, Clock, Facebook, Instagram, TikTok, MapleLeaf } from "./icons";

const makes = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Hyundai", "Kia",
  "Nissan", "Mazda", "GMC", "Jeep", "BMW", "Mercedes-Benz",
];

const types = [
  "SUVs", "Sedans", "Trucks", "Hatchbacks",
  "Coupes", "Minivans", "Vans", "Wagons",
];

const cities = [
  "Edmonton", "Sherwood Park", "St. Albert", "Leduc",
  "Spruce Grove", "Fort Saskatchewan", "Stony Plain", "Beaumont",
];

const quickLinks = [
  { label: "Home", href: "/" },
  { label: "How It Works", href: "/#how" },
  { label: "Car Selling Guide", href: "/car-selling-guide" },
  { label: "Get an Offer", href: "/get-offer" },
  { label: "Refer & Earn $100", href: "/referral" },
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Privacy Choices", href: "/privacy#privacy-choices" },
  { label: "Terms of Use", href: "/terms" },
];

const headingClass = "text-[13px] font-semibold uppercase tracking-[0.08em] text-navy";
const linkClass = "transition hover:text-brand-700";

export default function Footer() {
  const hasSocial =
    (site.social.facebook as string) !== "#" || (site.social.instagram as string) !== "#";

  return (
    <footer className="border-t border-slate-200 bg-white text-muted">
      <div className="container-x py-14">
        {/* SEO link columns */}
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <h4 className={headingClass}>Sell Your Car by Make</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {makes.map((m) => (
                <li key={m}>
                  <OfferCtaLink href={`/get-offer?make=${encodeURIComponent(m)}`} location="footer_make" className={linkClass}>
                    {m}
                  </OfferCtaLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className={headingClass}>We Buy Every Type</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {types.map((t) => (
                <li key={t}>
                  <OfferCtaLink location="footer_type" className={linkClass}>{t}</OfferCtaLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className={headingClass}>Areas We Serve</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {cities.map((c) => (
                <li key={c}>
                  <OfferCtaLink location="footer_city" className={linkClass}>{c}</OfferCtaLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Brand + quick links + contact */}
        <div className="mt-12 grid gap-x-8 gap-y-10 border-t border-slate-200 pt-12 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-12 lg:col-span-5">
            <div className="font-logo text-2xl font-extrabold tracking-tight text-navy">
              Drive<span className="text-brand-700">Offer</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              {site.name} buys cars across Canada — fast, fair offers, free pickup and
              inspection, and payment on the spot. No haggling, no dealership runaround.
            </p>
            {hasSocial && (
              <div className="mt-6 flex gap-2.5">
                {(site.social.facebook as string) !== "#" && (
                  <a
                    href={site.social.facebook}
                    aria-label="Facebook"
                    className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-navy transition hover:bg-slate-200"
                  >
                    <Facebook className="h-5 w-5" />
                  </a>
                )}
                {(site.social.instagram as string) !== "#" && (
                  <a
                    href={site.social.instagram}
                    aria-label="Instagram"
                    className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-navy transition hover:bg-slate-200"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Quick links */}
          <nav className="md:col-span-6 lg:col-span-3" aria-label="Footer">
            <h4 className={headingClass}>Quick Links</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {quickLinks.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className={linkClass}>{l.label}</Link>
                </li>
              ))}
              {(site.reviewsUrl as string) && (
                <li>
                  <a href={site.reviewsUrl} target="_blank" rel="noreferrer" className={linkClass}>
                    Leave a Google Review
                  </a>
                </li>
              )}
              <li>
                <a
                  href="https://www.trustpilot.com/review/driveoffer.ca"
                  target="_blank"
                  rel="noreferrer"
                  className={linkClass}
                >
                  Review DriveOffer on Trustpilot
                </a>
              </li>
              <li className="pt-1">
                <div className="flex items-center gap-4">
                  <a
                    href="https://www.facebook.com/DriveOfferCA"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="DriveOffer on Facebook"
                    className="text-muted transition hover:text-brand-700"
                  >
                    <Facebook className="h-5 w-5" />
                  </a>
                  <a
                    href="https://www.instagram.com/driveofferca"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="DriveOffer on Instagram"
                    className="text-muted transition hover:text-brand-700"
                  >
                    <Instagram className="h-5 w-5" />
                  </a>
                  <a
                    href="https://www.tiktok.com/@driveofferca"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="DriveOffer on TikTok"
                    className="text-muted transition hover:text-brand-700"
                  >
                    <TikTok className="h-5 w-5" />
                  </a>
                </div>
              </li>
            </ul>
          </nav>

          {/* Contact */}
          <div className="md:col-span-6 lg:col-span-4">
            <h4 className={headingClass}>Get In Touch</h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
                <a href={site.mapLink} target="_blank" rel="noreferrer" className={linkClass}>
                  {fullAddress}
                </a>
              </li>
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
                <TelLink location="footer" className="font-semibold text-navy hover:text-brand-700">
                  {site.phoneDisplay}
                </TelLink>
              </li>
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
                <a href={mailHref} className={linkClass}>{site.email}</a>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
                <span>
                  {site.hours}
                  <span className="mt-0.5 block text-xs opacity-80">{site.hoursNote}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-slate-200">
        <div className="container-x flex flex-col items-center justify-center gap-1.5 py-6 text-sm text-muted sm:flex-row sm:gap-4">
          <p>© 2023 DriveOffer</p>
          <span aria-hidden className="hidden text-slate-300 sm:inline">•</span>
          <span className="inline-flex items-center gap-1.5">
            Proudly buying cars across Canada
            <MapleLeaf className="h-4 w-4 text-navy" />
          </span>
        </div>
      </div>
    </footer>
  );
}
