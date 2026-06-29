"use client";

import { ChevronDown } from "./icons";
import { track } from "@/lib/analytics";

const SUMMARY = "flex cursor-pointer items-center justify-between gap-4 p-6 text-base font-semibold text-navy sm:text-lg";
const CHEVRON = "h-5 w-5 shrink-0 text-navy transition duration-300 group-open:rotate-180";
const ANSWER = "max-w-[70ch] px-6 pb-6 text-muted";

/**
 * A single FAQ accordion that fires GA4 `faq_opened` (with the question) the
 * first time it's expanded each open — native <details>/<summary>, so it needs
 * to be a client component for the onToggle. Class props default to the homepage
 * FAQ look; pass overrides to match other placements exactly.
 */
export default function FaqItem({
  q,
  a,
  summaryClassName = SUMMARY,
  chevronClassName = CHEVRON,
  answerClassName = ANSWER,
}: {
  q: string;
  a: string;
  summaryClassName?: string;
  chevronClassName?: string;
  answerClassName?: string;
}) {
  return (
    <details
      className="card group overflow-hidden p-0 [&_summary::-webkit-details-marker]:hidden"
      onToggle={(e) => {
        if (e.currentTarget.open) track("faq_opened", { question: q });
      }}
    >
      <summary className={summaryClassName}>
        {q}
        <ChevronDown className={chevronClassName} />
      </summary>
      <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-open:grid-rows-[1fr]">
        <div className="overflow-hidden">
          <p className={answerClassName}>{a}</p>
        </div>
      </div>
    </details>
  );
}
