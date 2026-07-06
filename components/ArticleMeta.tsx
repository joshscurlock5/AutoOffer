// E-E-A-T trust elements for guide articles: a byline with author + dates, an
// optional first-hand experience note, and an "About the author" card.
import Link from "next/link";
import { site, telHref } from "@/lib/site-config";
import { GUIDE_AUTHOR } from "@/lib/guides";
import { formatDate } from "@/lib/format";
import { Sparkles } from "./icons";

const AUTHOR_INITIALS = GUIDE_AUTHOR.name
  .split(/\s+/)
  .map((w) => w[0])
  .join("")
  .slice(0, 2)
  .toUpperCase();

function Monogram({ className = "" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-brand font-bold text-white ${className}`} aria-hidden="true">
      {AUTHOR_INITIALS}
    </span>
  );
}

export function Byline({ published, updated }: { published?: string; updated?: string }) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
      <span className="inline-flex items-center gap-2 font-semibold text-navy">
        <Monogram className="h-7 w-7 text-[11px]" />
        By {GUIDE_AUTHOR.name}
      </span>
      {published && (
        <>
          <span aria-hidden className="text-slate-300">·</span>
          <span>Published {formatDate(published)}</span>
        </>
      )}
      {updated && (
        <>
          <span aria-hidden className="text-slate-300">·</span>
          <span>Updated {formatDate(updated)}</span>
        </>
      )}
    </div>
  );
}

export function ExperienceNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div className="mt-8 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
      <p className="text-[15px] leading-relaxed text-navy">
        <span className="font-semibold">From our experience:</span> {note}
      </p>
    </div>
  );
}

export function AuthorCard() {
  return (
    <aside className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <div className="flex items-start gap-4">
        <Monogram className="h-12 w-12 text-base" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">About the author</p>
          <p className="mt-1 font-bold text-navy">{GUIDE_AUTHOR.name}</p>
          <p className="text-sm font-semibold text-slate-500">{GUIDE_AUTHOR.jobTitle}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{GUIDE_AUTHOR.bio}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link href="/about" className="font-semibold text-brand hover:text-brand-700">
              About {site.name}
            </Link>
            <a href={telHref} className="font-semibold text-brand hover:text-brand-700">
              Call or text {site.phoneDisplay}
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}
