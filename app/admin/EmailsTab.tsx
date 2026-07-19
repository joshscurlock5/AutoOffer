"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

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
  allTime: {
    leads: number;
    emailableLeads: number;
    reached: number;
    opened: number;
    clicked: number;
    bounced: number;
    optedOut: number;
  };
  inRange: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    unsubscribed: number;
  };
  perKind: { kind: string; sent: number; delivered: number; opened: number; clicked: number }[];
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

function Section({ title, children, tip }: { title: string; children: ReactNode; tip?: string }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h2>
      {children}
    </section>
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

export default function EmailsTab({ since, until }: { since: string; until: string }) {
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [previews, setPreviews] = useState<EmailPreview[] | null>(null);
  const [openKind, setOpenKind] = useState<string | null>(null); // one modal at a time

  // Stats re-fetch whenever the dashboard's date window moves.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/email-stats?since=${since}&until=${until}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.allTime) setStats(d as EmailStats); })
      .catch(() => { if (!cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, [since, until]);

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
        `this window: ${fmt(pk.sent)} sent · ${fmt(pk.delivered)} delivered · ${fmt(pk.opened)} opened` +
          (pk.clicked > 0 ? ` · ${fmt(pk.clicked)} clicked` : ""),
      );
    }
    return parts.length ? parts.join(" — ") : "Send tracking starts now — stats will appear here.";
  }

  return (
    <div>
      {/* (a) all-time performance — lead-level stamps, so it answers "what % of
          my leads actually receive / read our email" regardless of the window. */}
      <Section title="Email performance" tip="All-time, from delivery receipts stamped on each lead by the Resend webhook.">
        {!a ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Emailable leads"
              value={fmt(a.emailableLeads)}
              sub={`of ${fmt(a.leads)} leads`}
              tip="Leads whose address passes a basic email-shape check — the pool every send targets."
            />
            <StatCard
              label="Reached"
              value={fmt(a.reached)}
              sub={`${pctOf(a.reached, a.emailableLeads)} of emailable`}
              tip="Leads with ≥1 delivery receipt. Receipts only exist since the Resend webhook went live, so this undercounts older leads."
            />
            <StatCard
              label="Opened"
              value={fmt(a.opened)}
              sub={`${pctOf(a.opened, a.reached)} of reached`}
              tip="Leads with ≥1 open receipt. Opens rely on a tracking image — Apple/Gmail image proxying and blocking make this an undercount."
            />
            <StatCard
              label="Clicked"
              value={fmt(a.clicked)}
              sub={`${pctOf(a.clicked, a.reached)} of reached`}
              tip="Leads who clicked a link in any email — the strongest engagement signal we get."
            />
            <StatCard
              label="Bounced"
              value={fmt(a.bounced)}
              sub={`${pctOf(a.bounced, a.emailableLeads)} of emailable`}
              tip="Hard bounce — address dead. All further sends to these leads are skipped automatically."
            />
            <StatCard
              label="Opted out"
              value={fmt(a.optedOut)}
              sub={`${pctOf(a.optedOut, a.emailableLeads)} of emailable`}
              tip="Marked-as-spam + unsubscribe clicks. Stops nurture emails only — transactional still sends."
            />
          </div>
        )}
      </Section>

      {/* (b) window activity — commsEvents receipts inside the selected range. */}
      <Section title="Activity in this window" tip="Email receipts (from the Resend webhook + our send log) dated inside the selected range.">
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
                Send logging is new — every email sent from now on is counted here.
              </p>
            )}
            {stats && stats.perKind.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-2">Template</th>
                      <th className="py-2 pl-2 text-right">Sent</th>
                      <th className="py-2 pl-2 text-right">Delivered</th>
                      <th className="py-2 pl-2 text-right">Opened</th>
                      <th className="py-2 pl-2 text-right">Clicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.perKind.map((k) => (
                      <tr key={k.kind} className="border-b border-slate-50">
                        <td className="py-2 pr-2 font-medium text-navy">{k.kind}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{fmt(k.sent)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{fmt(k.delivered)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{fmt(k.opened)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums">{fmt(k.clicked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.trackingSince && (
                  <p className="mt-2 text-[11px] text-muted">tracking since {stats.trackingSince.slice(0, 10)}</p>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* (c) the gallery — every real template, grouped along the journey. */}
      <Section title="Every email we send" tip="Rendered from the live templates against a sample lead — exactly what a customer receives.">
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
                        {p.audience}
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
        <span className="font-semibold text-navy">About these numbers.</span> Delivery/open/click receipts began when the
        Resend webhook went live — leads emailed before that show no engagement even if they read everything. Opens are an
        undercount (Apple and Gmail proxy or block tracking images). Per-template tracking (the send log + kind-tagged
        receipts) collects from today forward, so template-level stats build up over time; the &ldquo;~sent&rdquo; figures
        are reconstructed from lifecycle stamps and are estimates, not receipts.
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
