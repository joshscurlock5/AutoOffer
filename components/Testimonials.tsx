import { Section } from "./Section";
import { Star, ExternalLink } from "./icons";
import { site } from "@/lib/site-config";
import ReviewsCarousel from "./ReviewsCarousel";

export default function Promise() {
  return (
    <Section className="bg-white">
      <div className="mx-auto max-w-col wide:max-w-none">
        <h2 className="h-section">What our customers are saying</h2>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          We&apos;ve purchased more than 2,000 cars from customers and received a lot of
          great feedback. See what&apos;s behind our 4.8 star average review rating.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex text-amber-400" role="img" aria-label="4.8 out of 5 stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-6 w-6" />
              ))}
            </span>
            <span className="font-display text-2xl font-extrabold text-navy">4.8</span>
            <span className="text-lg text-muted">stars</span>
          </div>
          {(site.reviewsUrl as string) && (
            <a
              href={site.reviewsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-base font-semibold text-brand-700 hover:underline"
            >
              See all reviews <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="mt-8">
          <ReviewsCarousel />
        </div>
      </div>
    </Section>
  );
}
