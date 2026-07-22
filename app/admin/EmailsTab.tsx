"use client";

import { useEffect, useMemo, useState, Fragment, type ReactNode } from "react";

// ---------------------------------------------------------------------------
//  "Emails" tab — every email the system sends, in one place:
//   (a) all-time performance stats (reach / opens / clicks / bounces / opt-outs),
//   (b) receipt activity inside the dashboard's selected date window,
//   (c) a gallery of the REAL templates (rendered server-side against a sample
//       lead by /api/admin/email-previews — they can't drift from real sends),
//   (d) a full-size viewer, and (e) a data-honesty footnote.
//
//  Self-fetching like AdsTab: the dashboard passes only the MT date window; the
//  two endpoints are fetched here (stats re-fetches on window change, previews
//  once — templates don't change per-range).
//
//  Small local copies of the dashboard's StatCard/InfoDot atoms live below on
//  purpose: AnalyticsDashboard.tsx is being reworked in parallel and doesn't
//  export them, and a 20-line clone beats a cross-file coupling on a 2,500-line
//  component.
// ---------------------------------------------------------------------------

interface EmailStats {
  filtered?: boolean;
  matched?: number;
  allTime: {
    leads: number;
    emailableLeads: number;
    reached: number;
    opened: number;
    clicked: number;
    responded: number;
    bounced: number;
    optedOut: number;
  };
  inRange: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
  };
  perKind: {
    kind: string;
    title: string;
    group: string;
    order: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    responded: number;
    bounced: number;
    optedOut: number;
    estSent: number;
    estResponded: number;
  }[];
  trackingSince: string | null;
  historicalSends: { kind: string; count: number; method: string }[];
}

interface EmailPreview {
  kind: string;
  title: string;
  group: string;
  trigger: string;
  audience: "transactional" | "nurture";
  subject: string;
  /** Hidden inbox-preview snippet (the email's preheader). */
  preheader: string;
  /** "From" display name the customer sees, e.g. "Sam at DriveOffer". */
  fromName: string;
  html: string;
}

// Local clone of the dashboard's ⓘ hover tip (see header comment for why).
function InfoDot({ tip }: { tip: string }) {
  return (
    <span className="group/info relative ml-1 inline-flex align-middle">
      <span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold normal-case leading-none text-slate-500">i</span>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 hidden w-56 -translate-x-1/2 rounded-lg bg-slate-800 px-3 py-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg group-hover/info:block">
        {tip}
      </span>
    </span>
  );
}

// Local clone of the dashboard's stat tile.
function StatCard({ label, value, sub, tip }: { label: string; value: string; sub?: string; tip?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}{tip && <InfoDot tip={tip} />}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-navy">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

// One labelled stat inside an expanded per-email-type detail row.
function Detail({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-base font-bold tabular-nums text-navy">{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

function Section({ title, children, tip }: { title: string; children: ReactNode; tip?: string }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h2>
      {children}
    </section>
  );
}

/** First letter of the sender name, for the avatar bubble. */
const initialOf = (name: string) => (name.trim()[0] || "?").toUpperCase();

/** One unread email as it appears in a phone inbox list: sender + subject in
 * bold (unread), the preheader as the gray preview snippet, an unread dot, and a
 * fixed sample time. This is the whole point of the preheader — the third line a
 * customer reads before deciding to open. */
function InboxRow({ p }: { p: EmailPreview }) {
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
        {initialOf(p.fromName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-bold text-navy">{p.fromName}</span>
          <span className="shrink-0 text-[11px] text-muted">9:41 AM</span>
        </div>
        <div className="truncate text-sm font-semibold text-navy">{p.subject}</div>
        <div className="truncate text-xs text-muted">{p.preheader || <span className="italic">(no preview text)</span>}</div>
      </div>
      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="unread" />
    </div>
  );
}

/** The same email as a phone push notification (iOS-Mail style): app row, sender
 * in bold, subject, then the preheader as the body snippet. */
function NotificationCard({ p }: { p: EmailPreview }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-3 shadow-sm backdrop-blur">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-600 text-lg text-white">✉</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">Mail</span>
          <span className="shrink-0 text-[10px] text-muted">now</span>
        </div>
        <div className="truncate text-sm font-bold text-navy">{p.fromName}</div>
        <div className="truncate text-sm font-medium text-navy">{p.subject}</div>
        <div className="line-clamp-2 text-xs text-muted">{p.preheader || <span className="italic">(no preview text)</span>}</div>
      </div>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-CA");
/** "x%" of a denominator, or an em-dash when the denominator is empty — a 0/0
 * shown as "0%" would read as a real (terrible) rate. */
const pctOf = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

// Gallery group order = the customer journey. Previews arrive in journey order
// already, but grouping re-buckets them, so the bucket order is pinned here.
const GROUP_ORDER = ["First contact", "Sent by you", "Automatic follow-ups", "Booking"];

const AUDIENCE_CHIP: Record<EmailPreview["audience"], string> = {
  // transactional = always sends (even after unsubscribe); nurture = stops on opt-out.
  transactional: "bg-sky-100 text-sky-800",
  nurture: "bg-amber-100 text-amber-800",
};

export default function EmailsTab({
  since,
  until,
  leadIds = null,
  filterLabel = "",
}: {
  since: string;
  until: string;
  /** When the dashboard's dimension filters (province / source / ad set /
   * device / …) are active, the matching leads' ids — every stat is scoped to
   * them. null = no filter, show all leads. */
  leadIds?: string[] | null;
  filterLabel?: string;
}) {
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [previews, setPreviews] = useState<EmailPreview[] | null>(null);
  const [openKind, setOpenKind] = useState<string | null>(null); // one modal at a time
  const [detailKind, setDetailKind] = useState<string | null>(null); // expanded per-type stats row
  const [unopenedView, setUnopenedView] = useState<"inbox" | "notification">("inbox"); // "How it looks unopened" toggle

  // Stable dependency AND the sole source the effect reads the ids from (a new
  // array ref each render would refetch forever). Prefix "F:" marks "filtered"
  // so an EMPTY allow-list (filters active, nothing matches) is distinct from
  // null (no filter) — the former must show zeros, not fall back to all leads.
  const filterKey = Array.isArray(leadIds) ? "F:" + leadIds.join(",") : null;

  // Stats re-fetch whenever the date window OR the active filters move. When
  // filtered, POST the allow-list; otherwise a plain GET over all leads.
  useEffect(() => {
    let cancelled = false;
    const ids = filterKey === null ? null : filterKey.slice(2) ? filterKey.slice(2).split(",") : [];
    const init: RequestInit | undefined = ids
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadIds: ids }) }
      : undefined;
    fetch(`/api/admin/email-stats?since=${since}&until=${until}`, init)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.allTime) setStats(d as EmailStats); })
      .catch(() => { if (!cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, [since, until, filterKey]);

  // Previews are range-independent — fetch once.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/email-previews")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setPreviews((d?.previews as EmailPreview[]) || []); })
      .catch(() => { if (!cancelled) setPreviews([]); });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, EmailPreview[]>();
    for (const p of previews || []) {
      const arr = map.get(p.group) || [];
      arr.push(p);
      map.set(p.group, arr);
    }
    // Pinned journey order first; any group a future template invents renders after.
    const keys = [...GROUP_ORDER.filter((g) => map.has(g)), ...[...map.keys()].filter((g) => !GROUP_ORDER.includes(g))];
    return keys.map((g) => ({ group: g, items: map.get(g) || [] }));
  }, [previews]);

  const open = openKind ? (previews || []).find((p) => p.kind === openKind) : undefined;

  if (!stats && !previews) return <p className="text-sm text-muted">Loading…</p>;

  const a = stats?.allTime;
  const r = stats?.inRange;

  /** Per-template stats line under each gallery card: honest historical evidence
   * (lifecycle stamps) + forward receipts (kind-tagged, collected from today). */
  function statsLine(kind: string): string {
    const hist = stats?.historicalSends.find((h) => h.kind === kind);
    const pk = stats?.perKind.find((k) => k.kind === kind);
    const parts: string[] = [];
    if (hist && hist.count > 0) parts.push(`~${fmt(hist.count)} sent · ${hist.method}`);
    if (pk) {
      parts.push(
        `in the selected date range: ${fmt(pk.sent)} sent · ${fmt(pk.delivered)} delivered · ${fmt(pk.opened)} opened` +
          (pk.clicked > 0 ? ` · ${fmt(pk.clicked)} clicked` : "") +
          (pk.responded > 0 ? ` · ${fmt(pk.responded)} replied` : ""),
      );
    }
    return parts.length ? parts.join(" — ") : "We just started counting this email — numbers will appear here.";
  }

  return (
    <div>
      {/* Scoped-view banner — shown whenever the dashboard's dimension filters
          (province / source / ad set / device / …) are narrowing the numbers. */}
      {leadIds && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <span className="font-bold uppercase tracking-wide">Filtered</span>
          {filterLabel && <span className="font-medium">{filterLabel}</span>}
          {(() => {
            const n = stats?.matched ?? leadIds.length;
            return (
              <span className="text-brand-600">
                · every number below is scoped to {fmt(n)} matching {n === 1 ? "lead" : "leads"}
              </span>
            );
          })()}
        </div>
      )}

      {/* (a) all-time performance — lead-level stamps, so it answers "what % of
          my leads actually receive / read our email" regardless of the window. */}
      <Section title="Email performance" tip="All-time totals, based on delivery reports from our email service.">
        {!a ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <StatCard
              label="Leads we can email"
              value={fmt(a.emailableLeads)}
              sub={`of ${fmt(a.leads)} leads`}
              tip="Leads whose email address looks valid — these are the people we can send email to."
            />
            <StatCard
              label="Reached"
              value={fmt(a.reached)}
              sub={`${pctOf(a.reached, a.emailableLeads)} of leads we can email`}
              tip="Leads who had at least one email confirmed as delivered. We only started getting delivery confirmations recently, so older leads are undercounted."
            />
            <StatCard
              label="Opened"
              value={fmt(a.opened)}
              sub={`${pctOf(a.opened, a.reached)} of reached`}
              tip="Leads who opened at least one email. Opens are detected with a hidden image that Apple and Gmail often block, so the true number is higher."
            />
            <StatCard
              label="Clicked"
              value={fmt(a.clicked)}
              sub={`${pctOf(a.clicked, a.reached)} of reached`}
              tip="Leads who clicked a link in any email — the clearest sign of real interest we get."
            />
            <StatCard
              label="Responded"
              value={fmt(a.responded)}
              sub={`${pctOf(a.responded, a.reached)} of reached`}
              tip="Leads who actually replied to an email — the strongest signal of interest, and unlike opens it can't be blocked. Counts every reply we've received, including from before open tracking existed."
            />
            <StatCard
              label="Bounced"
              value={fmt(a.bounced)}
              sub={`${pctOf(a.bounced, a.emailableLeads)} of leads we can email`}
              tip="The email address doesn't work. We automatically stop sending to these leads."
            />
            <StatCard
              label="Opted out"
              value={fmt(a.optedOut)}
              sub={`${pctOf(a.optedOut, a.emailableLeads)} of leads we can email`}
              tip="People who unsubscribed or marked an email as spam. Follow-up emails stop for them — essential emails still send."
            />
          </div>
        )}
      </Section>

      {/* (b) window activity — commsEvents receipts inside the selected range. */}
      <Section title="Activity in the selected date range" tip="Email activity (sends, deliveries, opens, clicks, unsubscribes) recorded during the selected dates.">
        {!r ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              {([
                ["sent", r.sent, "bg-slate-100 text-slate-800"],
                ["delivered", r.delivered, "bg-emerald-100 text-emerald-800"],
                ["opened", r.opened, "bg-sky-100 text-sky-800"],
                ["clicked", r.clicked, "bg-indigo-100 text-indigo-800"],
                ["unsubscribed", r.unsubscribed, "bg-rose-100 text-rose-800"],
              ] as const).map(([label, n, cls]) => (
                <span key={label} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
                  <span className="tabular-nums">{fmt(n)}</span> {label}
                </span>
              ))}
            </div>
            {r.sent === 0 && (
              <p className="mt-3 text-xs text-muted">
                We just started counting sends — every email from now on will show up here.
              </p>
            )}
          </div>
        )}
      </Section>

      {/* (b2) EVERY email type, all-time — the complete per-reason breakdown.
          One row per distinct reason for sending (each follow-up step separate),
          so the 1st reminder can be compared against the last. */}
      <Section
        title="Performance by email type"
        tip="Every email we send, one row each — including each step of the multi-step follow-ups — so you can compare how the 1st reminder performs vs. the last. All-time, not just the selected dates."
      >
        {!stats ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="card overflow-x-auto p-4">
            <p className="mb-2 text-xs text-muted">Tap any email to see its full breakdown and rates.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2">Email</th>
                  <th className="py-2 pl-2 text-right">Sent</th>
                  <th className="py-2 pl-2 text-right">Opened</th>
                  <th className="py-2 pl-2 text-right">Responded</th>
                  <th className="py-2 pl-2 text-right">Opted out</th>
                </tr>
              </thead>
              <tbody>
                {stats.perKind.map((k, i) => {
                  const isOpen = detailKind === k.kind;
                  const prev = stats.perKind[i - 1];
                  const showGroup = !prev || prev.group !== k.group;
                  const sentVal = k.estSent > 0 ? k.estSent : k.sent;
                  const sentEstimated = k.estSent > 0 && k.estSent !== k.sent;
                  const replyDenom = k.estSent || k.sent;
                  return (
                    <Fragment key={k.kind}>
                      {showGroup && (
                        <tr>
                          <td colSpan={5} className="pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            {k.group}
                          </td>
                        </tr>
                      )}
                      <tr
                        className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/60"
                        onClick={() => setDetailKind(isOpen ? null : k.kind)}
                      >
                        <td className="py-2 pr-2 font-medium text-navy">
                          <span className="mr-1 inline-block w-3 text-slate-400">{isOpen ? "▾" : "▸"}</span>{k.title}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums">{sentEstimated ? "~" : ""}{fmt(sentVal)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{fmt(k.opened)}</td>
                        <td className="py-2 pl-2 text-right font-semibold tabular-nums text-navy">{fmt(k.estResponded)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{fmt(k.optedOut)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <td colSpan={5} className="px-3 py-3">
                            <div className="flex flex-wrap gap-x-7 gap-y-3">
                              <Detail
                                label="Sent"
                                value={sentEstimated ? `~${fmt(sentVal)}` : fmt(sentVal)}
                                sub={sentEstimated ? `${fmt(k.sent)} tracked exactly` : "exact count"}
                              />
                              <Detail label="Delivered" value={fmt(k.delivered)} sub={`${pctOf(k.delivered, k.sent)} of tracked sent`} />
                              <Detail label="Open rate" value={pctOf(k.opened, k.delivered)} sub={`${fmt(k.opened)} of ${fmt(k.delivered)} delivered`} />
                              <Detail label="Click rate" value={pctOf(k.clicked, k.delivered)} sub={`${fmt(k.clicked)} clicked`} />
                              <Detail
                                label="Reply rate"
                                value={replyDenom > 0 ? pctOf(k.estResponded, replyDenom) : "—"}
                                sub={`${fmt(k.estResponded)} replied`}
                              />
                              <Detail label="Bounced" value={fmt(k.bounced)} />
                              <Detail label="Opted out" value={fmt(k.optedOut)} />
                            </div>
                            <p className="mt-2 text-[11px] text-muted">
                              Opens/clicks count only emails sent after tracking went on; replies are attributed to the last email each lead
                              received — a best estimate for older replies, exact from now on.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-muted">
              &ldquo;Sent&rdquo; shows the exact tracked count where we have one, otherwise a &ldquo;~&rdquo; estimate from each lead&apos;s history.
              Opens count only emails sent after tracking went on{stats.trackingSince ? ` (${stats.trackingSince.slice(0, 10)})` : ""}; replies are
              attributed to the last email each lead received, so older replies are a best estimate and everything from now on is exact.
            </p>
          </div>
        )}
      </Section>

      {/* (b3) "How it looks unopened" — the inbox row / push notification a
          customer sees BEFORE opening: sender name, subject, and the preview
          snippet (preheader). This is the surface that drives whether they open
          at all, so it gets its own section, separate from the full render. */}
      <Section
        title="How it looks unopened"
        tip="What a customer sees in their inbox or as a phone notification before they open — sender name, subject, and the preview snippet. This is what decides whether they open at all."
      >
        {previews === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : previews.length === 0 ? (
          <p className="text-sm text-muted">Couldn&apos;t load the previews.</p>
        ) : (
          <>
            {/* Inbox ⇄ Notification segmented toggle. */}
            <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
              {(["inbox", "notification"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setUnopenedView(v)}
                  className={`rounded-md px-3 py-1.5 transition ${
                    unopenedView === v ? "bg-white text-navy shadow-sm" : "text-muted hover:text-navy"
                  }`}
                >
                  {v === "inbox" ? "Inbox list" : "Notification"}
                </button>
              ))}
            </div>

            {grouped.map(({ group, items }) => (
              <div key={group} className="mb-6">
                <h3 className="mb-2 text-sm font-bold text-navy">{group}</h3>
                {unopenedView === "inbox" ? (
                  <div className="card divide-y divide-slate-100 overflow-hidden p-0">
                    {items.map((p) => (
                      <InboxRow key={p.kind} p={p} />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 rounded-2xl bg-slate-100/70 p-3 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((p) => (
                      <NotificationCard key={p.kind} p={p} />
                    ))}
                  </div>
                )}
              </div>
            ))}

            <p className="mt-1 text-[11px] text-muted">
              The preview snippet is the email&apos;s hidden &ldquo;preheader.&rdquo; A blank one means the inbox falls back to
              showing the top of the email instead — usually the logo, which wastes the line.
            </p>
          </>
        )}
      </Section>

      {/* (c) the gallery — every real template, grouped along the journey. */}
      <Section title="Every email we send" tip="These are the real emails, filled in with a sample customer — exactly what a customer receives.">
        {previews === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : previews.length === 0 ? (
          <p className="text-sm text-muted">Couldn&apos;t load the previews.</p>
        ) : (
          grouped.map(({ group, items }) => (
            <div key={group} className="mb-6">
              <h3 className="mb-2 text-sm font-bold text-navy">{group}</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((p) => (
                  <div key={p.kind} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-bold text-navy">{p.title}</div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${AUDIENCE_CHIP[p.audience]}`}>
                        {p.audience === "transactional" ? "always sends" : "stops on opt-out"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{p.trigger}</div>
                    <div className="mt-1 truncate text-xs font-medium" title={p.subject}>
                      <span className="text-muted">Subject:</span> {p.subject}
                    </div>
                    {/* Thumbnail: the REAL html in a sandboxed iframe, rendered at
                        email width (640px) and scaled down — pointer-events off so
                        the card underneath stays the click target. */}
                    <div className="relative mt-3 h-64 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <iframe
                        srcDoc={p.html}
                        sandbox=""
                        title={p.title}
                        className="pointer-events-none absolute left-0 top-0 origin-top-left"
                        style={{ width: 640, height: 1400, transform: "scale(0.42)" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenKind(p.kind)}
                      className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
                    >
                      View full size
                    </button>
                    <div className="mt-1 text-[11px] text-muted">{statsLine(p.kind)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Section>

      {/* (e) data-honesty footnote — so nobody misreads partial data as truth. */}
      <div className="card mt-6 p-4 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-navy">About these numbers.</span> Open and click tracking only records emails sent <span className="font-semibold">after</span> it
        was turned on — anyone emailed before that shows no opens or clicks even if they read everything, and opens are always an undercount
        (Apple and Gmail block the hidden image that detects them). <span className="font-semibold text-navy">Responses are the reliable signal</span> — a reply
        can&apos;t be blocked, and we count every reply we&apos;ve ever received. Per-email-type counting started when tracking went on, so those
        numbers build up over time; the &ldquo;~sent&rdquo; figures are estimates from each lead&apos;s history, not exact counts.
      </div>

      {/* (d) full-size viewer — one at a time, click-outside or ✕ to close. */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpenKind(null)}
        >
          <div
            className="card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-navy">{open.title}</div>
                <div className="truncate text-xs text-muted" title={open.subject}>{open.subject}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpenKind(null)}
                className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto">
              <iframe srcDoc={open.html} sandbox="" title={open.title} className="w-full border-0" style={{ height: 1200 }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
