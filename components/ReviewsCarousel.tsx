"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/site-config";
import { GoogleG, Star } from "./icons";

/* ───────────────────────────────────────────────────────────────────────────
   TODO — REPLACE WITH REAL GOOGLE DATA BEFORE PUBLISHING.
   These are placeholder reviews. Swap REVIEWS for your hand-picked real ones,
   and set GOOGLE_RATING / GOOGLE_REVIEW_COUNT to your actual Google numbers.
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

const GOOGLE_RATING = "5.0"; // TODO: your real Google rating
const GOOGLE_REVIEW_COUNT = REVIEWS.length; // TODO: your real total review count

function Stars({ n, className = "h-4 w-4" }: { n: number; className?: string }) {
  return (
    <span className="flex text-amber-400" role="img" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`${className} ${i < n ? "" : "text-slate-200"}`} />
      ))}
    </span>
  );
}

export default function ReviewsCarousel() {
  const [i, setI] = useState(0);
  const count = REVIEWS.length;

  useEffect(() => {
    const id = setInterval(() => setI((p) => (p + 1) % count), 5000);
    return () => clearInterval(id);
  }, [count]);

  const r = REVIEWS[i];

  return (
    <div className="relative flex h-full flex-col p-8 sm:p-10">
      {/* Google Reviews link — corner */}
      {(site.reviewsUrl as string) && (
        <a
          href={site.reviewsUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Read our reviews on Google"
          className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-muted shadow-sm transition hover:border-brand hover:text-navy"
        >
          <GoogleG className="h-4 w-4" /> Google Reviews
        </a>
      )}

      {/* Rating summary */}
      <div className="pr-28">
        <div className="flex items-end gap-2">
          <span className="font-display text-4xl font-extrabold leading-none text-navy">
            {GOOGLE_RATING}
          </span>
          <span className="pb-0.5 text-sm text-muted">/ 5.0</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Stars n={5} className="h-5 w-5" />
          <span className="text-sm text-muted">{GOOGLE_REVIEW_COUNT} Google reviews</span>
        </div>
      </div>

      {/* Rotating review */}
      <div className="mt-7 flex-1 border-t border-slate-100 pt-6">
        <div key={i} className="animate-fade-up">
          <Stars n={r.rating} className="h-5 w-5" />
          <p className="mt-3 min-h-[6.5rem] text-lg leading-relaxed text-navy">&ldquo;{r.text}&rdquo;</p>
          <p className="mt-3 text-base font-semibold text-navy">
            {r.name}
            <span className="font-normal text-muted">
              {" "}
              · {r.location} · {r.when}
            </span>
          </p>
        </div>
      </div>

      {/* Dots */}
      <div className="mt-6 flex items-center gap-1">
        {REVIEWS.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setI(idx)}
            aria-label={`Show review ${idx + 1}`}
            className="group grid h-11 place-items-center px-1.5"
          >
            <span
              className={`block h-2 rounded-full transition-all ${
                idx === i ? "w-6 bg-brand" : "w-2 bg-slate-300 group-hover:bg-slate-400"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
