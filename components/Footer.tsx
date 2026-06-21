import Link from "next/link";
import { site, fullAddress, mailHref } from "@/lib/site-config";
import TelLink from "./TelLink";
import { Phone, Mail, MapPin, Clock, Facebook, Instagram, MapleLeaf } from "./icons";

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
  { label: "Get an Offer", href: "/get-offer" },
  { label: "Refer & Earn $100", href: "/referral" },
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
];

const headingClass = "text-[13px] font-semibold uppercase tracking-[0.08em] text-navy";
const linkClass = "transition hover:text-brand-700";

export default function Footer() {
  const year = new Date().getFullYear();
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
                  <Link href={`/get-offer?make=${encodeURIComponent(m)}`} className={linkClass}>
                    {m}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className={headingClass}>We Buy Every Type</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {types.map((t) => (
                <li key={t}>
                  <Link href="/get-offer" className={linkClass}>{t}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className={headingClass}>Areas We Serve</h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {cities.map((c) => (
                <li key={c}>
                  <Link href="/get-offer" className={linkClass}>{c}</Link>
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
                <span>{site.hours}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-slate-200">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-sm text-muted sm:flex-row">
          <p>© {year} {site.legalName}. All rights reserved.</p>
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/privacy" className="hover:text-brand-700">Privacy Policy</Link>
            <span aria-hidden className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1.5">
              Proudly buying cars across Canada
              <MapleLeaf className="h-4 w-4 text-navy" />
            </span>
            {site.amvicNumber ? (
              <>
                <span aria-hidden className="text-slate-300">•</span>
                <span>{site.amvicNumber}</span>
              </>
            ) : null}
            {site.insured ? (
              <>
                <span aria-hidden className="text-slate-300">•</span>
                <span>Bonded &amp; insured</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </footer>
  );
}
