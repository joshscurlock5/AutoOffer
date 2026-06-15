import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import MapEmbed from "@/components/MapEmbed";
import TelLink from "@/components/TelLink";
import { site, fullAddress, mailHref } from "@/lib/site-config";
import { Phone, Mail, MapPin, Clock } from "@/components/icons";

export const metadata: Metadata = {
  title: "Contact Us",
  description: `Get in touch with ${site.name}. Call ${site.phoneDisplay} to sell your car fast, or send us a message and we'll get right back to you.`,
};

export default function ContactPage() {
  return (
    <>
      {/* Hero with the phone front and centre */}
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="container-x py-16 text-center sm:py-20">
          <h1 className="font-display text-4xl font-extrabold text-navy sm:text-5xl">
            Let&apos;s talk about your car
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            The fastest way to sell is to call us — a real person will pick up and can
            make you an offer right over the phone.
          </p>

          <TelLink
            location="contact_hero"
            className="mx-auto mt-8 inline-flex items-center gap-4 rounded-2xl bg-brand px-8 py-5 text-white shadow-lift transition hover:bg-brand-600"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white/20">
              <Phone className="h-7 w-7" />
            </span>
            <span className="text-left">
              <span className="block text-sm font-medium uppercase tracking-wide text-white/80">
                Call to sell now
              </span>
              <span className="block font-display text-2xl font-extrabold sm:text-3xl">
                {site.phoneDisplay}
              </span>
            </span>
          </TelLink>
          <p className="mt-4 text-sm text-muted">{site.hours}</p>
        </div>
      </section>

      {/* Contact methods + form */}
      <section className="py-16 sm:py-20">
        <div className="container-x grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="h-section">Get in touch</h2>
            <p className="mt-3 text-muted">
              Questions, an unusual vehicle, or just prefer email? Reach us however
              works best for you.
            </p>

            <div className="mt-8 space-y-4">
              <TelLink location="contact_card" className="card flex items-center gap-4 p-5 transition hover:shadow-lift">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><Phone className="h-6 w-6" /></span>
                <span>
                  <span className="block text-sm text-muted">Phone</span>
                  <span className="block text-lg font-bold text-navy">{site.phoneDisplay}</span>
                </span>
              </TelLink>
              <a href={mailHref} className="card flex items-center gap-4 p-5 transition hover:shadow-lift">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><Mail className="h-6 w-6" /></span>
                <span>
                  <span className="block text-sm text-muted">Email</span>
                  <span className="block text-lg font-bold text-navy">{site.email}</span>
                </span>
              </a>
              <div className="card flex items-center gap-4 p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><MapPin className="h-6 w-6" /></span>
                <span>
                  <span className="block text-sm text-muted">Head office</span>
                  <span className="block font-semibold text-navy">{fullAddress}</span>
                </span>
              </div>
              <div className="card flex items-center gap-4 p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><Clock className="h-6 w-6" /></span>
                <span>
                  <span className="block text-sm text-muted">Hours</span>
                  <span className="block font-semibold text-navy">{site.hours}</span>
                </span>
              </div>
            </div>
          </div>

          <ContactForm />
        </div>
      </section>

      <MapEmbed />
    </>
  );
}
