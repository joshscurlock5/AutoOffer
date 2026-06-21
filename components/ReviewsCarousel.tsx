import { Star } from "./icons";
import Carousel from "./Carousel";

/* ───────────────────────────────────────────────────────────────────────────
   TODO — REPLACE WITH REAL GOOGLE REVIEWS BEFORE RUNNING ADS.
   These are placeholder reviews. Swap REVIEWS for your hand-picked real ones.
   ─────────────────────────────────────────────────────────────────────────── */
const REVIEWS = [
  {
    name: "Sarah M.",
    location: "Edmonton",
    when: "2 weeks ago",
    rating: 5,
    text: "Honestly the easiest car sale I've ever done. Fair offer, they came to me, and I had a bank draft in hand the same afternoon.",
  },
  {
    name: "Daniel R.",
    location: "Sherwood Park",
    when: "1 month ago",
    rating: 5,
    text: "Got more than the dealership's trade-in quote. No haggling, no pressure — exactly what they promised online.",
  },
  {
    name: "Priya K.",
    location: "St. Albert",
    when: "3 weeks ago",
    rating: 5,
    text: "Booked online, they inspected my SUV at my work, and paid on the spot. Super professional from start to finish.",
  },
  {
    name: "Mike T.",
    location: "Edmonton",
    when: "1 month ago",
    rating: 5,
    text: "I was nervous about selling, so this was perfect. The final offer matched the online estimate to the dollar.",
  },
  {
    name: "Jenna L.",
    location: "Leduc",
    when: "2 months ago",
    rating: 5,
    text: "Quick, friendly, and paid by bank draft before they took the keys. Would absolutely sell to them again.",
  },
];

function Stars({ n }: { n: number }) {
  return (
    <span className="flex text-amber-400" role="img" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-5 w-5 ${i < n ? "" : "text-slate-200"}`} />
      ))}
    </span>
  );
}

/**
 * Swipeable review carousel — one card at a time on mobile, exactly three on
 * desktop, looping endlessly (three identical copies feed the Carousel's loop).
 */
export default function ReviewsCarousel() {
  const loopReviews = [...REVIEWS, ...REVIEWS, ...REVIEWS];
  return (
    <Carousel loop trackClassName="gap-5 pb-1">
      {loopReviews.map((r, idx) => (
        <article
          key={`${r.name}-${idx}`}
          className="flex w-full shrink-0 snap-start flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-7 wide:w-[calc((100%_-_2.5rem)/3)]"
        >
          <Stars n={r.rating} />
          <p className="mt-4 min-h-[6rem] text-lg leading-relaxed text-navy">
            &ldquo;{r.text}&rdquo;
          </p>
          <p className="mt-4 text-base font-semibold text-navy">
            {r.name}
            <span className="font-normal text-muted">
              {" "}
              · {r.location} · {r.when}
            </span>
          </p>
        </article>
      ))}
    </Carousel>
  );
}
