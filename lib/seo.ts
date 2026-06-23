// ===========================================================================
//  Structured-data (schema.org JSON-LD) builders for SEO + E-E-A-T.
//  Kept in one place so every page emits consistent, accurate markup that
//  matches the visible content (never fabricate ratings/counts here).
// ===========================================================================

import { site } from "@/lib/site-config";
import { GUIDE_AUTHOR, GUIDE_DEFAULT_PUBLISHED, type FlatArticle, type GuideFaq } from "@/lib/guides";

export const SITE_URL = site.url;
const ORG_ID = `${SITE_URL}/#organization`;
const LOGO = `${SITE_URL}/icon.png`;
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

// Cities we actually serve (mirrors the footer list).
const AREA_SERVED = [
  "Edmonton", "Sherwood Park", "St. Albert", "Leduc",
  "Spruce Grove", "Fort Saskatchewan", "Stony Plain", "Beaumont",
];

// The Alberta vehicle-industry regulator that issues the AMVIC licence.
const AMVIC = { name: "Alberta Motor Vehicle Industry Council", abbr: "AMVIC", url: "https://www.amvic.org" };

/** Sitewide business entity — rendered once in the root layout. */
export function organizationSchema() {
  const sameAs = [site.social.facebook, site.social.instagram].filter((u) => u && u !== "#");
  return {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    "@id": ORG_ID,
    name: site.name,
    legalName: site.legalName,
    description: site.description,
    url: SITE_URL,
    image: OG_IMAGE,
    logo: LOGO,
    telephone: site.phoneE164,
    email: site.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.line1,
      addressLocality: site.address.city,
      addressRegion: site.address.province,
      ...(site.address.postal ? { postalCode: site.address.postal } : {}),
      addressCountry: "CA",
    },
    areaServed: AREA_SERVED.map((name) => ({ "@type": "City", name })),
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "00:00",
      closes: "23:59",
    },
    ...(sameAs.length ? { sameAs } : {}),
    knowsAbout: [
      "Vehicle wholesaling",
      "Buying used cars from the public",
      "AMVIC licensing",
      "Alberta vehicle registration and bill of sale",
    ],
    ...(site.owner
      ? { founder: { "@type": "Person", name: site.owner, jobTitle: "Founder & Owner", worksFor: { "@id": ORG_ID } } }
      : {}),
    // AMVIC licence — a real, verifiable government credential (never a fake rating).
    ...(site.amvicNumber
      ? {
          hasCredential: {
            "@type": "EducationalOccupationalCredential",
            credentialCategory: "license",
            name: `AMVIC ${site.amvicClass} Licence`,
            identifier: site.amvicNumber,
            recognizedBy: {
              "@type": "GovernmentOrganization",
              name: AMVIC.name,
              alternateName: AMVIC.abbr,
              url: AMVIC.url,
            },
          },
        }
      : {}),
  };
}

/** Article schema for a single guide page. */
export function articleSchema(a: FlatArticle, path: string) {
  const url = `${SITE_URL}${path}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    description: a.metaDescription || a.blurb,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    image: OG_IMAGE,
    datePublished: a.published || GUIDE_DEFAULT_PUBLISHED,
    dateModified: a.updated || a.published || GUIDE_DEFAULT_PUBLISHED,
    author: {
      "@type": "Person",
      name: GUIDE_AUTHOR.name,
      jobTitle: GUIDE_AUTHOR.jobTitle,
      knowsAbout: GUIDE_AUTHOR.knowsAbout,
      url: `${SITE_URL}/about`,
    },
    publisher: {
      "@type": "Organization",
      name: site.name,
      logo: { "@type": "ImageObject", url: LOGO },
    },
    articleSection: a.categoryTitle,
    ...(a.keywords && a.keywords.length ? { keywords: a.keywords.join(", ") } : {}),
    inLanguage: "en-CA",
  };
}

/** BreadcrumbList for any page. */
export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

/** FAQPage built from an article's FAQ list. */
export function faqSchema(faqs: GuideFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** CollectionPage for the guide hub. */
export function collectionSchema(path: string, name: string, description: string, articles: FlatArticle[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${SITE_URL}${path}`,
    isPartOf: { "@id": ORG_ID },
    hasPart: articles.map((a) => ({
      "@type": "Article",
      headline: a.title,
      url: `${SITE_URL}/car-selling-guide/${a.slug}`,
    })),
  };
}
