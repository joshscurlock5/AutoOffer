import { Star } from "./icons";
import Carousel from "./Carousel";

/* ───────────────────────────────────────────────────────────────────────────
   All REAL Google reviews (no date shown by request). Add new ones here as more
   come in.
   ─────────────────────────────────────────────────────────────────────────── */
const REVIEWS: {
  name: string;
  location?: string;
  when?: string;
  rating: number;
  text: string;
}[] = [
  {
    name: "Andrew Schmit",
    rating: 5,
    text: "Sold my Toyota Camry to Auto Offer today. Samir was great to deal with and made the whole process real easy. He came to me and everything went exactly as he said it would. Fair offer and quick payment! Highly recommend!",
  },
  {
    name: "Alex",
    rating: 5,
    text: "They bought my truck. Super quick process, barely had to do anything and got an awesome deal.",
  },
  {
    name: "Gurwinder Singh",
    rating: 5,
    text: "Great experience selling my two vehicles, picked up the vehicles same and offered very strong cash offer. Definitely offered top dollar, will recommend strongly. If you looking to sell the car, avoid the marketplace hassle and contact them💯",
  },
  {
    name: "Andrew Morgan",
    rating: 5,
    text: "I sold my 2014 Ford F150 through Auto Offer and honestly it was way easier than trying to sell it myself. Samir answered all my questions. Couldn’t have asked for a smoother experience.",
  },
];

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${n.toFixed(1)} out of 5 stars`}>
      <span className="flex text-amber-400">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`h-5 w-5 ${i < n ? "" : "text-slate-200"}`} />
        ))}
      </span>
      <span className="font-display text-lg font-extrabold leading-none text-navy">{n.toFixed(1)}</span>
      <span className="text-sm text-muted">stars</span>
    </div>
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
          className="flex w-full shrink-0 snap-start snap-always flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-7 wide:w-[calc((100%_-_2.5rem)/3)]"
        >
          <Stars n={r.rating} />
          <p className="mt-4 min-h-[6rem] text-lg leading-relaxed text-navy">
            &ldquo;{r.text}&rdquo;
          </p>
          <p className="mt-4 text-base font-semibold text-navy">
            {r.name}
            {(r.location || r.when) && (
              <span className="font-normal text-muted">
                {" "}
                {[r.location, r.when].filter(Boolean).map((m) => `· ${m}`).join(" ")}
              </span>
            )}
          </p>
        </article>
      ))}
    </Carousel>
  );
}
