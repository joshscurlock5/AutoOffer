import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHeading } from "@/components/Section";
import PhoneButton from "@/components/PhoneButton";
import JsonLd from "@/components/JsonLd";
import { guideCategories, allArticles, GUIDE_CTA, GUIDE_AUTHOR, GUIDE_DEFAULT_UPDATED } from "@/lib/guides";
import { collectionSchema, breadcrumbSchema } from "@/lib/seo";
import { site } from "@/lib/site-config";
import { formatDate } from "@/lib/format";
import { Car, Banknote, MapPin, Tag, ArrowRight } from "@/components/icons";
import OfferCtaLink from "@/components/OfferCtaLink";

const HUB_DESCRIPTION = `Free guides on selling your car in Alberta — pricing, paperwork, payment, scams, and area-by-area tips from ${site.name}.`;

export const metadata: Metadata = {
  title: "Car Selling Guide",
  description: HUB_DESCRIPTION,
  alternates: { canonical: "/car-selling-guide" },
  openGraph: {
    type: "website",
    title: `Car Selling Guide | ${site.name}`,
    description: HUB_DESCRIPTION,
    url: "/car-selling-guide",
    siteName: site.name,
  },
};

const CAT_ICON = { selling: Car, payment: Banknote, areas: MapPin, value: Tag } as const;

export default function CarSellingGuidePage() {
  return (
    <>
      <JsonLd
        data={[
          collectionSchema("/car-selling-guide", `Car Selling Guide | ${site.name}`, HUB_DESCRIPTION, allArticles),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Car Selling Guide", path: "/car-selling-guide" },
          ]),
        ]}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-cream">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative py-12 text-center sm:py-16">
          <p className="eyebrow">Car Selling Guide</p>
          <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-navy sm:text-5xl">
            Everything you need to sell your car
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Straight answers on pricing, paperwork, payment, and staying safe — written for sellers
            in Edmonton and across Alberta. When you&apos;re ready, an offer takes about a minute.
          </p>
          <p className="mt-4 text-sm text-muted">
            Written and kept current by {GUIDE_AUTHOR.name} · Updated {formatDate(GUIDE_DEFAULT_UPDATED)}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <OfferCtaLink location="guide_hub" className="btn-primary">
              Get My Offer <ArrowRight className="h-4 w-4" />
            </OfferCtaLink>
            <PhoneButton variant="ghost" />
          </div>

          {/* Jump-to-category chips */}
          <nav aria-label="Guide categories" className="mt-10 flex flex-wrap justify-center gap-2.5">
            {guideCategories.map((c) => {
              const Icon = CAT_ICON[c.key as keyof typeof CAT_ICON];
              return (
                <a
                  key={c.key}
                  href={`#${c.key}`}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-brand hover:text-brand"
                >
                  <Icon className="h-4 w-4" /> {c.title}
                </a>
              );
            })}
          </nav>
        </div>
      </section>

      {/* One section per category */}
      {guideCategories.map((c, i) => {
        const Icon = CAT_ICON[c.key as keyof typeof CAT_ICON];
        return (
          <Section
            key={c.key}
            id={c.key}
            className={`scroll-mt-24 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
          >
            <div className="flex items-start gap-4">
              <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand sm:grid">
                <Icon className="h-6 w-6" />
              </span>
              <SectionHeading eyebrow={`${c.articles.length} guides`} title={c.title} subtitle={c.blurb} />
            </div>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {c.articles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/car-selling-guide/${a.slug}`}
                  className="card group flex h-full flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <h3 className="text-lg font-bold text-navy group-hover:text-brand">{a.title}</h3>
                  <p className="mt-2 flex-1 text-muted">{a.blurb}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                    Read guide <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        );
      })}

      {/* Closing CTA */}
      <section className="bg-brand">
        <div className="container-x flex flex-col items-center gap-6 py-14 text-center">
          <div>
            <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{GUIDE_CTA.title}</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-white/85">{GUIDE_CTA.text}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <OfferCtaLink location="guide_hub_closing" className="btn bg-white px-7 py-3.5 text-brand hover:bg-brand-50">
              {GUIDE_CTA.button} <ArrowRight className="h-5 w-5" />
            </OfferCtaLink>
            <PhoneButton variant="dark" location="guide_hub_closing" />
          </div>
        </div>
      </section>
    </>
  );
}
