import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PhoneButton from "@/components/PhoneButton";
import JsonLd from "@/components/JsonLd";
import { Byline, ExperienceNote, AuthorCard } from "@/components/ArticleMeta";
import {
  allArticles,
  getArticle,
  guideCategories,
  GUIDE_CTA,
  GUIDE_AUTHOR,
  GUIDE_DEFAULT_PUBLISHED,
  GUIDE_DEFAULT_UPDATED,
  type FlatArticle,
} from "@/lib/guides";
import { articleSchema, breadcrumbSchema, faqSchema } from "@/lib/seo";
import { site } from "@/lib/site-config";
import { Home, ChevronRight, ArrowRight, Check } from "@/components/icons";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return allArticles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return { title: "Car Selling Guide" };
  const path = `/car-selling-guide/${a.slug}`;
  const description = a.metaDescription || a.blurb;
  return {
    title: a.title,
    description,
    ...(a.keywords && a.keywords.length ? { keywords: a.keywords } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: a.title,
      description,
      url: path,
      siteName: site.name,
      publishedTime: a.published || GUIDE_DEFAULT_PUBLISHED,
      modifiedTime: a.updated || a.published || GUIDE_DEFAULT_UPDATED,
      authors: [GUIDE_AUTHOR.name],
      section: a.categoryTitle,
    },
    twitter: { card: "summary_large_image", title: a.title, description },
  };
}

export default async function GuideArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const path = `/car-selling-guide/${article.slug}`;
  const published = article.published || GUIDE_DEFAULT_PUBLISHED;
  const updated = article.updated || article.published || GUIDE_DEFAULT_UPDATED;

  const category = guideCategories.find((c) => c.key === article.category);
  const curated = (article.relatedSlugs || [])
    .map((s) => getArticle(s))
    .filter((a): a is FlatArticle => Boolean(a) && a!.slug !== article.slug);
  const sameCat = (category?.articles ?? []).filter((a) => a.slug !== article.slug);
  const related = (curated.length ? curated : sameCat).slice(0, 3);

  const schemas: object[] = [
    articleSchema(article, path),
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Car Selling Guide", path: "/car-selling-guide" },
      { name: article.categoryTitle, path: `/car-selling-guide#${article.category}` },
      { name: article.title, path },
    ]),
    ...(article.faqs && article.faqs.length ? [faqSchema(article.faqs)] : []),
  ];

  return (
    <article>
      <JsonLd data={schemas} />

      {/* Header */}
      <header className="relative overflow-hidden border-b border-slate-100 bg-cream">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative py-10 sm:py-14">
          <nav aria-label="Breadcrumb" className="mb-5">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <li>
                <Link href="/" className="inline-flex items-center gap-1 hover:text-brand">
                  <Home className="h-4 w-4" /> Home
                </Link>
              </li>
              <ChevronRight className="h-4 w-4 text-slate-300" />
              <li>
                <Link href="/car-selling-guide" className="hover:text-brand">Car Selling Guide</Link>
              </li>
              <ChevronRight className="h-4 w-4 text-slate-300" />
              <li>
                <Link href={`/car-selling-guide#${article.category}`} className="hover:text-brand">
                  {article.categoryTitle}
                </Link>
              </li>
            </ol>
          </nav>

          <p className="eyebrow">{article.categoryTitle}</p>
          <h1 className="mt-3 max-w-3xl font-display text-3xl font-extrabold leading-tight tracking-tight text-navy sm:text-[2.6rem]">
            {article.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">{article.blurb}</p>
          <Byline published={published} updated={updated} />
        </div>
      </header>

      {/* Body */}
      <div className="container-x py-12 sm:py-14">
        <div className="mx-auto max-w-3xl">
          {/* Key takeaways */}
          {article.keyTakeaways && article.keyTakeaways.length > 0 && (
            <div className="mb-10 rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-bold uppercase tracking-wide text-navy">Key takeaways</p>
              <ul className="mt-4 space-y-2.5">
                {article.keyTakeaways.map((t, i) => (
                  <li key={i} className="flex items-start gap-3 text-[15px] leading-relaxed text-navy">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-white">
                      <Check className="h-3 w-3" />
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Article body */}
          <div className="space-y-6">
            {article.body.map((block, i) => (
              <section key={i}>
                {block.h && <h2 className="text-xl font-bold text-navy sm:text-2xl">{block.h}</h2>}
                {block.p?.map((para, j) => (
                  <p key={j} className={`text-[17px] leading-relaxed text-ink/80 ${block.h && j === 0 ? "mt-3" : "mt-4"}`}>
                    {para}
                  </p>
                ))}
                {block.ul && (
                  <ul className="mt-4 space-y-2.5">
                    {block.ul.map((item, k) => (
                      <li key={k} className="flex items-start gap-3 text-[17px] leading-relaxed text-ink/80">
                        <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {/* First-hand experience note (E-E-A-T) */}
          <ExperienceNote note={article.experienceSignal} />

          {/* Inline CTA */}
          <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl bg-navy-900 p-7 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">{GUIDE_CTA.title}</h2>
              <p className="mt-1.5 text-white/70">{GUIDE_CTA.text}</p>
            </div>
            <Link href="/get-offer" className="btn-primary shrink-0 whitespace-nowrap">
              {GUIDE_CTA.button} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* FAQ (fact-checked) — visible content matches the FAQPage schema */}
          {article.faqs && article.faqs.length > 0 && (
            <section className="mt-14">
              <h2 className="text-2xl font-bold text-navy">Frequently asked questions</h2>
              <dl className="mt-6 divide-y divide-slate-200 border-t border-slate-200">
                {article.faqs.map((f, i) => (
                  <div key={i} className="py-5">
                    <dt className="text-lg font-semibold text-navy">{f.q}</dt>
                    <dd className="mt-2 text-[17px] leading-relaxed text-ink/80">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* About the author (E-E-A-T) */}
          <AuthorCard />

          {/* Related */}
          {related.length > 0 && (
            <div className="mt-14 border-t border-slate-200 pt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Keep reading</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/car-selling-guide/${r.slug}`}
                    className="card group p-5 transition hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    <h3 className="font-bold text-navy group-hover:text-brand">{r.title}</h3>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
                      Read <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/car-selling-guide" className="btn-ghost">
              ← Back to the Car Selling Guide
            </Link>
            <PhoneButton variant="ghost" />
          </div>
        </div>
      </div>
    </article>
  );
}
