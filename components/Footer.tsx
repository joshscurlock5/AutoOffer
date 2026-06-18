import Link from "next/link";
import { site, fullAddress, mailHref } from "@/lib/site-config";
import TelLink from "./TelLink";
import { Phone, Mail, MapPin, Clock, Facebook, Instagram, MapleLeaf } from "./icons";

const brands = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Hyundai",
  "Nissan", "Mazda", "Jeep", "BMW", "Mercedes-Benz",
];

const services = [
  { label: "Get an instant estimate", href: "/get-offer" },
  { label: "How it works", href: "/#how" },
  { label: "Refer & earn $100", href: "/referral" },
  { label: "Sell a financed car", href: "/#how" },
  { label: "About us", href: "/about" },
  { label: "Contact us", href: "/contact" },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-200 bg-white text-muted">
      <div className="container-x grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-5">
        {/* Brand */}
        <div className="lg:col-span-2">
          <div className="font-display text-2xl font-extrabold tracking-tight text-navy">
            Drive<span className="text-brand-700">Offer</span>
          </div>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted">
            {site.name} buys cars right across Canada. Fast, fair offers by phone
            or email, free vehicle pickup and inspection, and payment on the spot.
            No sign-up, no obligation, no dealership runaround.
          </p>
          {((site.social.facebook as string) !== "#" ||
            (site.social.instagram as string) !== "#") && (
            <div className="mt-5 flex gap-3">
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

        {/* Get in touch */}
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-navy">
            Get In Touch
          </h4>
          <ul className="mt-4 space-y-3 text-base">
            <li className="flex gap-3">
              <MapPin className="h-5 w-5 shrink-0 text-navy" />
              <a href={site.mapLink} target="_blank" rel="noreferrer" className="hover:text-brand-700">
                {fullAddress}
              </a>
            </li>
            <li className="flex gap-3">
              <Phone className="h-5 w-5 shrink-0 text-navy" />
              <TelLink location="footer" className="font-semibold text-navy hover:text-brand-700">
                {site.phoneDisplay}
              </TelLink>
            </li>
            <li className="flex gap-3">
              <Mail className="h-5 w-5 shrink-0 text-navy" />
              <a href={mailHref} className="hover:text-brand-700">
                {site.email}
              </a>
            </li>
            <li className="flex gap-3">
              <Clock className="h-5 w-5 shrink-0 text-navy" />
              <span>{site.hours}</span>
            </li>
          </ul>
        </div>

        {/* Quick links */}
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-navy">
            Quick Links
          </h4>
          <ul className="mt-4 space-y-3 text-base">
            <li><Link href="/get-offer" className="hover:text-brand-700">Get an Offer</Link></li>
            <li><Link href="/#how" className="hover:text-brand-700">How It Works</Link></li>
            <li><Link href="/about" className="hover:text-brand-700">About Us</Link></li>
            <li><Link href="/referral" className="hover:text-brand-700">Refer &amp; Earn $100</Link></li>
            <li><Link href="/contact" className="hover:text-brand-700">Contact Us</Link></li>
            {(site.reviewsUrl as string) && (
              <li><a href={site.reviewsUrl} target="_blank" rel="noreferrer" className="hover:text-brand-700">Leave a Google Review</a></li>
            )}
            <li><Link href="/privacy" className="hover:text-brand-700">Privacy Policy</Link></li>
          </ul>
        </div>

        {/* Brands + services */}
        <div>
          <h4 className="text-sm font-bold uppercase tracking-wider text-navy">
            We Buy Every Brand
          </h4>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-base">
            {[...brands].sort((a, b) => a.localeCompare(b)).map((b) => (
              <li key={b}>
                <Link href="/get-offer" className="hover:text-brand-700">{b}</Link>
              </li>
            ))}
          </ul>
          <h4 className="mt-6 text-sm font-bold uppercase tracking-wider text-navy">
            Services
          </h4>
          <ul className="mt-4 space-y-2 text-base">
            {services.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="hover:text-brand-700">{s.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="container-x flex flex-col items-center justify-between gap-3 py-6 text-sm text-muted sm:flex-row">
          <p>© {year} {site.legalName}. All rights reserved.</p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/privacy" className="hover:text-brand-700">Privacy Policy</Link>
            <span aria-hidden>•</span>
            <span className="inline-flex items-center gap-1.5">
              Proudly buying cars across Canada
              <MapleLeaf className="h-4 w-4 text-navy" />
            </span>
            {site.amvicNumber ? (
              <>
                <span aria-hidden>•</span>
                <span>{site.amvicNumber}</span>
              </>
            ) : null}
            {site.insured ? (
              <>
                <span aria-hidden>•</span>
                <span>Bonded &amp; insured</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
    </footer>
  );
}
