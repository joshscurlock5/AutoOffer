import { site, fullAddress, mailHref } from "@/lib/site-config";
import { Container } from "./Section";
import TelLink from "./TelLink";
import { MapPin, Phone, Mail, Clock, ExternalLink } from "./icons";

export default function MapEmbed() {
  return (
    <section className="bg-slate-50">
      <Container className="py-12 sm:py-16">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="h-px w-8 bg-slate-300" />
          <h2 className="font-display text-xl font-bold text-navy">
            {site.name} Head Office
          </h2>
          <span className="h-px w-8 bg-slate-300" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card flex flex-col gap-5 p-6 lg:order-2">
            <div className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy">Visit us</p>
                <p className="text-sm text-muted">{fullAddress}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                <Phone className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy">Call us</p>
                <TelLink location="map" className="text-sm font-bold text-brand hover:underline">
                  {site.phoneDisplay}
                </TelLink>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy">Email us</p>
                <a href={mailHref} className="text-sm text-muted hover:text-brand">
                  {site.email}
                </a>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                <Clock className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy">Hours</p>
                <p className="text-sm text-muted">{site.hours}</p>
              </div>
            </div>
            <a
              href={site.mapLink}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost mt-auto"
            >
              Get Directions <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <div className="overflow-hidden rounded-2xl shadow-card lg:order-1 lg:col-span-2">
            <iframe
              title={`${site.name} location map`}
              src={site.mapEmbedSrc}
              className="h-[320px] w-full lg:h-full"
              style={{ border: 0, minHeight: 320 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
