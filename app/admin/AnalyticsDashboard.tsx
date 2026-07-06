"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AnalyticsData } from "@/lib/analyticsData";
import type { Profile, AdInsight, Ga4Traffic, Touch } from "@/lib/types";
import {
  computeView,
  filterProfiles,
  computeFilterOptions,
  segmentTable,
  scoreBand,
  SEGMENT_DIMENSIONS,
  type Filters,
  type SegmentDimension,
  type Count,
} from "@/lib/analyticsView";
import { META_SEGMENTS, segmentProfiles, buildMetaCsv, type MetaSegment } from "@/lib/metaExport";

// ---------------------------------------------------------------------------
//  Customer-360 analytics dashboard. All data is computed server-side (profiles)
//  then filtered + re-aggregated in the browser (lib/analyticsView) so the filter
//  bar is instant. Hand-rolled charts (CSS width %) — no charting dependency.
// ---------------------------------------------------------------------------

const STAGE_STYLE: Record<string, string> = {
  partial: "bg-amber-100 text-amber-800",
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-indigo-100 text-indigo-800",
  scheduled: "bg-purple-100 text-purple-800",
  closed: "bg-emerald-100 text-emerald-800",
  lost: "bg-slate-200 text-slate-600",
  spam: "bg-red-100 text-red-700",
};

function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDur(ms?: number): string {
  if (!ms || ms < 1000) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${(m / 60).toFixed(1)}h`;
}

function fmtMins(m?: number | null): string {
  if (m == null) return "—";
  return m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`;
}

function money(n?: number): string {
  return n ? `$${Math.round(n).toLocaleString("en-CA")}` : "—";
}

// Like money() but keeps cents — for small figures like cost-per-lead where
// $14.61 vs $15 matters (so it matches Meta's number exactly).
function money2(n?: number | null): string {
  if (!n) return "—";
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Provenance strings for the "where's this from?" info dots (an audit aid).
const SRC = {
  site: "Your website's own database — form submissions, merged into one record per person.",
  siteGrouped: "Your website's database, grouped by the source saved on each lead (UTM tag or referrer).",
  behavior: "First-party tracking on your site — pages viewed, device, and time on site.",
  geo: "IP-address location lookup (ipwho.is), added shortly after each lead arrives.",
  ga4: "Google Analytics 4 — every site visitor, including anonymous ones who never filled a form.",
  comms: "Delivery receipts from Resend (email) and Twilio (SMS) — whether messages we sent arrived, were opened, or had a link clicked.",
  clarity: "Microsoft Clarity session recordings. In Clarity, add the filter Custom user ID = this session ID to watch this person's visits.",
  events: "Your own events database (first-party) — every visitor session, anonymous ones included; nothing sent to third parties. Not affected by the filter bar above.",
  journey: "Your website's database — every marketing source this person arrived from, oldest to newest. First chip = first touch.",
  score: "Computed from this person's own activity — recency, engagement, funnel depth, vehicle value, and source. Not machine learning; every point is explained in the breakdown inside the profile. A prioritization aid, not a prediction.",
  enrich: "Derived from data the customer already gave us — email provider type, phone area-code region, and a vehicle value tier. No extra questions asked, no outside services.",
};

const BAND_STYLE: Record<string, string> = {
  hot: "bg-emerald-100 text-emerald-800",
  warm: "bg-amber-100 text-amber-800",
  cool: "bg-slate-100 text-slate-600",
};

function ScoreBadge({ score }: { score: number }) {
  const band = scoreBand(score);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${BAND_STYLE[band]}`}>
      {band} {score}
    </span>
  );
}

/** Short display label for one journey touch. */
function touchLabel(t: Touch): string {
  if (t.utmCampaign) return t.utmCampaign.slice(0, 30);
  if (t.utmSource) return t.utmMedium ? `${t.utmSource}/${t.utmMedium}` : t.utmSource;
  if (t.gclid) return "google ads";
  if (t.fbclid) return "facebook ad";
  if (t.referrer) {
    try {
      return new URL(t.referrer).hostname.replace(/^www\./, "");
    } catch {
      return "referral";
    }
  }
  return "direct";
}

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID || "";

// A small ⓘ that reveals, on hover, exactly where a metric's data comes from.
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

function StatCard({ label, value, sub, tip }: { label: string; value: string; sub?: string; tip?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}{tip && <InfoDot tip={tip} />}</div>
      <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function HBars({ title, rows, tip }: { title: string; rows: Count[]; tip?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 text-sm">
              <div className="w-28 shrink-0 truncate text-muted" title={r.label}>{r.label}</div>
              <div className="h-4 flex-1 rounded bg-slate-100">
                <div className="h-4 rounded bg-brand-600" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              <div className="w-8 shrink-0 text-right font-semibold text-navy">{r.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Funnel({ rows, tip, title = "Conversion funnel" }: { rows: Count[]; tip?: string; title?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].count : 0;
          const pct = i > 0 && prev > 0 ? Math.round((r.count / prev) * 100) : null;
          return (
            <div key={r.label} className="flex items-center gap-2 text-sm">
              <div className="w-24 shrink-0 text-muted">{r.label}</div>
              <div className="h-5 flex-1 rounded bg-slate-100">
                <div className="flex h-5 items-center rounded bg-brand-600 px-2 text-xs font-semibold text-white" style={{ width: `${(r.count / max) * 100}%` }}>
                  {r.count}
                </div>
              </div>
              <div className="w-12 shrink-0 text-right text-xs text-muted">{pct != null ? `${pct}%` : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VBars({ title, rows, tip }: { title: string; rows: { date: string; leads: number }[]; tip?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No leads in range.</p>
      ) : (
        <div className="flex h-28 items-end gap-0.5 overflow-x-auto">
          {rows.map((r) => (
            <div key={r.date} className="min-w-[4px] flex-1 rounded-t bg-brand-600/80" style={{ height: `${(r.leads / max) * 100}%` }} title={`${r.date}: ${r.leads}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function Heatmap({ grid, tip }: { grid: number[][]; tip?: string }) {
  const max = Math.max(1, ...grid.flat());
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="card overflow-x-auto p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">When leads arrive (day × hour, your time){tip && <InfoDot tip={tip} />}</h3>
      <div className="min-w-[560px] space-y-0.5">
        {grid.map((row, d) => (
          <div key={d} className="flex items-center gap-0.5">
            <div className="w-8 shrink-0 text-[11px] text-muted">{days[d]}</div>
            {row.map((c, h) => (
              <div
                key={h}
                className="h-4 flex-1 rounded-sm"
                style={{ backgroundColor: c ? `rgba(37,99,235,${0.18 + 0.82 * (c / max)})` : "#f1f5f9" }}
                title={`${days[d]} ${h}:00 — ${c} lead${c === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        ))}
        <div className="flex gap-0.5 pl-8 pt-1 text-[10px] text-muted">
          <span className="flex-1">12a</span>
          <span className="flex-[6] text-center">6a</span>
          <span className="flex-[6] text-center">12p</span>
          <span className="flex-[6] text-center">6p</span>
          <span className="flex-[5] text-right">11p</span>
        </div>
      </div>
    </div>
  );
}

function Sel({
  label,
  value,
  onChange,
  opts,
}: {
  label: string;
  value?: string;
  onChange: (v?: string) => void;
  opts: string[];
}) {
  return (
    <label className="flex min-w-[120px] flex-col text-xs">
      <span className="mb-0.5 font-semibold text-muted">{label}</span>
      <select className="field py-1.5 text-sm" value={value || ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">All</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function SegmentView({
  rows,
  dim,
  setDim,
  tip,
}: {
  rows: ReturnType<typeof segmentTable>;
  dim: SegmentDimension;
  setDim: (d: SegmentDimension) => void;
  tip?: string;
}) {
  return (
    <div className="card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-navy">Segment performance — how each group responds{tip && <InfoDot tip={tip} />}</h3>
        <label className="flex items-center gap-2 text-xs text-muted">
          Compare by
          <select className="field py-1 text-sm" value={dim} onChange={(e) => setDim(e.target.value as SegmentDimension)}>
            {SEGMENT_DIMENSIONS.map((d) => (
              <option key={d.key} value={d.key}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-2">Group</th>
            <th className="px-2 text-right">People</th>
            <th className="px-2 text-right">Leads</th>
            <th className="px-2 text-right">Offers</th>
            <th className="px-2 text-right">Close %</th>
            <th className="px-2 text-right">Avg offer</th>
            <th className="px-2 text-right">Revenue</th>
            <th className="px-2 text-right" title="Average lead score (0-100) across the group">Avg score</th>
            <th className="pl-2 text-right">Avg resp</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="py-3 text-muted">No data.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.group} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-semibold text-navy">{r.group}</td>
                <td className="px-2 text-right">{r.people}</td>
                <td className="px-2 text-right">{r.leads}</td>
                <td className="px-2 text-right">{r.offers}</td>
                <td className="px-2 text-right font-semibold">{r.closeRate}%</td>
                <td className="px-2 text-right">{r.avgOffer ? money(r.avgOffer) : "—"}</td>
                <td className="px-2 text-right">{r.revenue ? money(r.revenue) : "—"}</td>
                <td className="px-2 text-right">{r.avgScore}</td>
                <td className="pl-2 text-right">{fmtMins(r.avgResponseMins)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-muted">{k}</span>
      <span className="min-w-0 truncate text-ink" title={v}>{v}</span>
    </div>
  );
}

function ProfileRow({ p, onDelete }: { p: Profile; onDelete: (p: Profile) => void }) {
  const [open, setOpen] = useState(false);
  const a = p.attribution;
  const loc = [p.geo?.city, p.geo?.region, p.geo?.country].filter(Boolean).join(", ");
  return (
    <div className="card p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-navy">{p.name || p.emails[0] || p.phones[0] || "(no name)"}</span>
            <ScoreBadge score={p.score} />
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STAGE_STYLE[p.stage] || "bg-slate-100 text-slate-600"}`}>{p.stage}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">via {p.source}</span>
            {p.device?.type && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">{p.device.type}</span>}
            {loc && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">{loc}</span>}
            {p.emailBounced && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">email bounced</span>}
            {p.emailOptOut && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">email opt-out</span>}
          </div>
          <div className="mt-1 truncate text-sm text-muted">{[...p.phones, ...p.emails].join(" · ") || "no contact"}</div>
          {p.vehicles.length > 0 && <div className="mt-0.5 truncate text-sm text-ink">{p.vehicles.join(", ")}</div>}
        </div>
        <div className="shrink-0 text-right text-xs text-muted">
          <div>{timeAgo(p.lastActivityAt)}</div>
          <div>{p.touchCount} touch{p.touchCount === 1 ? "" : "es"}</div>
          {p.purchasePrice ? <div className="font-semibold text-emerald-700">{money(p.purchasePrice)}</div> : null}
        </div>
      </button>

      {open && (
        <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 md:grid-cols-2">
          <div className="space-y-1.5 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Where they came from</div>
            <Row k="Source" v={p.source} />
            {a?.utmCampaign && <Row k="Campaign" v={a.utmCampaign} />}
            {a?.utmMedium && <Row k="Medium" v={a.utmMedium} />}
            {a?.utmContent && <Row k="Ad / content" v={a.utmContent} />}
            {a?.referrer && <Row k="Referrer" v={a.referrer} />}
            {a?.landingPath && <Row k="Landed on" v={a.landingPath} />}
            {loc && <Row k="Location" v={loc} />}
            {p.device?.type && <Row k="Device" v={[p.device.type, p.device.os, p.device.browser].filter(Boolean).join(" · ")} />}
            {p.touchHistory && p.touchHistory.length > 0 && (
              <>
                <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Journey<InfoDot tip={SRC.journey} />
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {p.touchHistory.map((t, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-300">→</span>}
                      <span
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-ink"
                        title={t.at ? new Date(t.at).toLocaleString("en-CA") : undefined}
                      >
                        {touchLabel(t)}
                      </span>
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">On-site behavior</div>
            <Row k="Time on site" v={fmtDur(p.behavior?.timeOnSiteMs)} />
            <Row k="Pageviews" v={String(p.behavior?.pageviews ?? "—")} />
            <Row k="Furthest step" v={p.behavior?.maxFunnelStep ? `Step ${p.behavior.maxFunnelStep}` : "—"} />
            <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">
              Lead score — {p.score}/100<InfoDot tip={SRC.score} />
            </div>
            {p.scoreBreakdown.map((f) => (
              <div key={f.label} className="flex gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-muted" title={f.label}>{f.label}</span>
                <span className={`shrink-0 font-semibold ${f.points < 0 ? "text-red-600" : "text-navy"}`}>
                  {f.points}{f.max > 0 ? `/${f.max}` : ""}
                </span>
              </div>
            ))}
            {p.enrichment && (
              <>
                <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Derived<InfoDot tip={SRC.enrich} />
                </div>
                {p.enrichment.emailType && <Row k="Email type" v={p.enrichment.emailType} />}
                {p.enrichment.phoneRegion && <Row k="Phone region" v={p.enrichment.phoneRegion} />}
                {p.enrichment.vehicleTier && (
                  <Row
                    k="Vehicle tier"
                    v={`${p.enrichment.vehicleTier}${p.enrichment.vehicleAge !== undefined ? ` (${p.enrichment.vehicleAge} yrs old)` : ""}`}
                  />
                )}
              </>
            )}
            {(p.emailEngagement || p.smsEngagement) && (
              <>
                <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Engagement<InfoDot tip={SRC.comms} />
                </div>
                {p.emailEngagement && (
                  <Row
                    k="Emails"
                    v={`${p.emailEngagement.deliveredCount ?? 0} delivered · ${p.emailEngagement.opensCount ?? 0} opened · ${p.emailEngagement.clicksCount ?? 0} clicked`}
                  />
                )}
                {p.emailEngagement?.lastClickedUrl && <Row k="Last click" v={p.emailEngagement.lastClickedUrl} />}
                {p.smsEngagement && (
                  <Row
                    k="Texts"
                    v={`${p.smsEngagement.deliveredCount ?? 0} delivered · ${p.smsEngagement.failedCount ?? 0} failed`}
                  />
                )}
              </>
            )}
            {p.offer && <Row k="Offer" v={`${money(p.offer.low)}–${money(p.offer.high)}`} />}
            {p.firstResponseMins != null && <Row k="Response time" v={fmtMins(p.firstResponseMins)} />}
            {p.appointmentAt && <Row k="Inspection" v={new Date(p.appointmentAt).toLocaleString("en-CA")} />}
            {p.behavior?.sessionId && (
              <div className="flex items-center gap-2 pt-1">
                <span className="w-28 shrink-0 text-muted">Session ID</span>
                <span className="min-w-0 truncate font-mono text-xs text-ink" title={p.behavior.sessionId}>{p.behavior.sessionId}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(p.behavior?.sessionId || "").catch(() => {})}
                  className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-navy hover:bg-slate-200"
                >
                  copy
                </button>
                {CLARITY_ID && (
                  <a
                    href={`https://clarity.microsoft.com/projects/view/${CLARITY_ID}/impressions`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs font-semibold text-brand-600 hover:underline"
                  >
                    Replays →<InfoDot tip={SRC.clarity} />
                  </a>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Timeline</div>
            <ol className="space-y-1.5">
              {p.timeline.map((e, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                  <span className="text-ink">
                    {e.label}
                    <span className="ml-1 text-xs text-muted">{new Date(e.at).toLocaleDateString("en-CA")}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
              {p.leadIds.length > 0 && (
                <Link href="/admin" className="text-xs font-semibold text-brand-600 hover:underline">Open in Leads →</Link>
              )}
              <button
                type="button"
                onClick={() => onDelete(p)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Delete profile
              </button>
            </div>
          </div>
        </div>
      )}
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

function AdPerformance({ profiles }: { profiles: Profile[] }) {
  const [range, setRange] = useState("last_30d");
  const [data, setData] = useState<{ configured: boolean; insights: AdInsight[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/ads?range=${range}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ configured: false, insights: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const rows = useMemo(() => {
    return (data?.insights || []).map((ins) => {
      // Leads + cost-per-lead come from Meta's own Pixel numbers (match Ads Manager).
      // Revenue/ROAS still use YOUR closed-sale data, matched to the campaign by UTM tag.
      const ps = profiles.filter((p) => (p.attribution?.utmCampaign || "") === ins.campaign);
      const revenue = ps.filter((p) => p.stage === "closed").reduce((s, p) => s + (p.purchasePrice || 0), 0);
      const leads = ins.leads ?? 0;
      const cpl = ins.costPerLead ?? (leads ? ins.spend / leads : null);
      return { ...ins, leads, revenue, cpl, roas: ins.spend ? revenue / ins.spend : null };
    });
  }, [data, profiles]);

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  if (loading) return <div className="card p-4 text-sm text-muted">Loading ad performance…</div>;
  if (!data?.configured) {
    return (
      <div className="card p-4 text-sm text-muted">
        <span className="font-semibold text-navy">Meta ads not connected yet.</span> Add{" "}
        <code className="rounded bg-slate-100 px-1">META_MARKETING_TOKEN</code> and{" "}
        <code className="rounded bg-slate-100 px-1">META_AD_ACCOUNT_ID</code> in Amplify to see spend, cost-per-lead, and ROAS here.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Ad spend" value={money(totalSpend)} tip="Meta Ads API — total you paid Meta to run this ad." />
          <StatCard label="Leads from ads" value={String(totalLeads)} tip="Meta Pixel — form-fills Meta attributes to your ad. Same number as Ads Manager." />
          <StatCard label="Cost / lead" value={money2(totalLeads ? totalSpend / totalLeads : null)} tip="Meta ad spend ÷ Meta Pixel leads — matches Ads Manager's cost per result." />
          <StatCard label="ROAS" value={totalSpend ? `${(totalRevenue / totalSpend).toFixed(1)}×` : "—"} sub={money(totalRevenue)} tip="Your closed-sale revenue ÷ Meta spend. Fills in when an ad-tagged lead becomes a sale." />
        </div>
        <select className="field py-1 text-sm" value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="last_7d">Last 7 days</option>
          <option value="last_30d">Last 30 days</option>
          <option value="last_90d">Last 90 days</option>
        </select>
      </div>
      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-2" title="Campaign name from Meta.">Campaign</th>
              <th className="px-2 text-right" title="Meta Ads API — amount spent.">Spend</th>
              <th className="px-2 text-right" title="Meta Ads API — times your ad was shown.">Impr.</th>
              <th className="px-2 text-right" title="Meta Ads API — link clicks.">Clicks</th>
              <th className="px-2 text-right" title="Meta Ads API — click-through rate.">CTR</th>
              <th className="px-2 text-right" title="Meta Pixel — leads Meta attributes to the ad.">Leads</th>
              <th className="px-2 text-right" title="Meta ad spend ÷ Meta Pixel leads.">Cost/lead</th>
              <th className="px-2 text-right" title="Your closed-sale prices for leads UTM-tagged to this campaign.">Revenue</th>
              <th className="pl-2 text-right" title="Revenue ÷ spend.">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="py-3 text-muted">No ad spend in range.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.campaign} className="border-b border-slate-100">
                  <td className="py-2 pr-2 font-semibold text-navy">{r.campaign}</td>
                  <td className="px-2 text-right">{money(r.spend)}</td>
                  <td className="px-2 text-right">{r.impressions.toLocaleString("en-CA")}</td>
                  <td className="px-2 text-right">{r.clicks.toLocaleString("en-CA")}</td>
                  <td className="px-2 text-right">{r.ctr.toFixed(1)}%</td>
                  <td className="px-2 text-right">{r.leads}</td>
                  <td className="px-2 text-right font-semibold">{money2(r.cpl)}</td>
                  <td className="px-2 text-right">{r.revenue ? money(r.revenue) : "—"}</td>
                  <td className="pl-2 text-right">{r.roas != null ? `${r.roas.toFixed(1)}×` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Spend, leads &amp; cost-per-lead come straight from Meta (matches Ads Manager). Revenue &amp; ROAS use your own closed-sale data, matched to this campaign by UTM tag.</p>
      </div>
    </div>
  );
}

function MetaExport({ profiles }: { profiles: Profile[] }) {
  const download = (seg: MetaSegment) => {
    const { filename, csv, rows } = buildMetaCsv(profiles, seg);
    if (!rows) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {META_SEGMENTS.map((s) => {
          const n = segmentProfiles(profiles, s.key).length;
          return (
            <button
              key={s.key}
              type="button"
              disabled={!n}
              onClick={() => download(s.key)}
              className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-navy">{s.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-navy">{n}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{s.hint}</p>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">
        Downloads a CSV in Meta&apos;s customer-list template, built from the currently filtered people. Upload at
        business.facebook.com → Audiences → Create → Customer list — Ads Manager hashes every field in your browser
        before anything reaches Meta. Heads-up: audiences under ~100 matched people won&apos;t deliver ads, and
        lookalikes need a 100+ seed — set them up now so they fill as you grow. Full walkthrough:{" "}
        <code className="rounded bg-slate-100 px-1">docs/meta-audiences.md</code>.
      </p>
    </div>
  );
}

function TrafficGa4() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{ configured: boolean; traffic: Ga4Traffic | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/ga4?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ configured: false, traffic: null }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  if (loading) return <div className="card p-4 text-sm text-muted">Loading traffic…</div>;
  if (!data?.configured || !data.traffic) {
    return (
      <div className="card p-4 text-sm text-muted">
        <span className="font-semibold text-navy">GA4 not connected yet.</span> Add{" "}
        <code className="rounded bg-slate-100 px-1">GA4_PROPERTY_ID</code>,{" "}
        <code className="rounded bg-slate-100 px-1">GA4_SA_CLIENT_EMAIL</code>, and{" "}
        <code className="rounded bg-slate-100 px-1">GA4_SA_PRIVATE_KEY</code> in Amplify to see total visitors, sources, and traffic here.
      </div>
    );
  }
  const t = data.traffic;
  const n = (x: number) => x.toLocaleString("en-CA");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Visitors" value={n(t.totals.users)} tip={SRC.ga4} />
          <StatCard label="New visitors" value={n(t.totals.newUsers)} tip={SRC.ga4} />
          <StatCard label="Sessions" value={n(t.totals.sessions)} tip={SRC.ga4} />
          <StatCard label="Pageviews" value={n(t.totals.pageviews)} tip={SRC.ga4} />
          <StatCard label="Engagement" value={`${Math.round(t.totals.engagementRate * 100)}%`} tip="Google Analytics 4 — share of engaged sessions (GA4's engagement rate)." />
        </div>
        <select className="field py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <VBars title="Visitors over time" rows={t.overTime.map((o) => ({ date: o.date, leads: o.users }))} tip={SRC.ga4} />
        <HBars title="Traffic sources" rows={t.bySource.map((s) => ({ label: s.label, count: s.users }))} tip={SRC.ga4} />
        <HBars title="By country" rows={t.byCountry.map((c) => ({ label: c.label, count: c.users }))} tip={SRC.ga4} />
        <HBars title="By device" rows={t.byDevice.map((d) => ({ label: d.label, count: d.users }))} tip={SRC.ga4} />
      </div>
    </div>
  );
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const { lookupsTotal, events: ev } = data;
  const [filters, setFilters] = useState<Filters>({});
  const [dim, setDim] = useState<SegmentDimension>("source");
  const [q, setQ] = useState("");
  const [sortByScore, setSortByScore] = useState(false);
  // Profiles deleted this session vanish immediately (also archived server-side,
  // so they stay gone on refresh and drop out of every chart below).
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const profiles = useMemo(() => data.profiles.filter((p) => !deletedIds.has(p.id)), [data.profiles, deletedIds]);

  async function deleteProfile(p: Profile) {
    if (!p.leadIds.length) {
      alert("This person came from a chat or referral only — there's no lead to delete here.");
      return;
    }
    if (!confirm(`Delete ${p.name || p.emails[0] || p.phones[0] || "this profile"}? They're removed from your analytics, but you can restore them from the admin Deleted tab.`)) return;
    setDeletedIds((prev) => new Set(prev).add(p.id));
    await Promise.all(
      p.leadIds.map((id) =>
        fetch("/api/admin/leads", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "lead", id, patch: { archived: true, archivedAt: new Date().toISOString() } }),
        }).catch(() => {}),
      ),
    );
  }

  const options = useMemo(() => computeFilterOptions(profiles), [profiles]);
  const filtered = useMemo(() => filterProfiles(profiles, filters), [profiles, filters]);
  const view = useMemo(() => computeView(filtered), [filtered]);
  const segments = useMemo(() => segmentTable(filtered, dim), [filtered, dim]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const base = !n
      ? filtered
      : filtered.filter((p) =>
          [p.name, ...p.emails, ...p.phones, p.source, ...p.vehicles, p.attribution?.utmCampaign, p.geo?.city, p.geo?.region]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(n),
        );
    return sortByScore ? [...base].sort((a, b) => b.score - a.score) : base;
  }, [q, filtered, sortByScore]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <div className="container-x py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Customer Analytics</h1>
          <p className="text-sm text-muted">One profile per person — ad → visit → form → replies → close.</p>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-brand-600 hover:underline">← Leads</Link>
      </div>

      {/* Filter bar — drives everything below */}
      <div className="card mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs">
            <span className="mb-0.5 font-semibold text-muted">From</span>
            <input type="date" className="field py-1.5 text-sm" value={filters.dateFrom || ""} onChange={(e) => set({ dateFrom: e.target.value || undefined })} />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-0.5 font-semibold text-muted">To</span>
            <input type="date" className="field py-1.5 text-sm" value={filters.dateTo || ""} onChange={(e) => set({ dateTo: e.target.value || undefined })} />
          </label>
          <Sel label="Country" value={filters.country} onChange={(v) => set({ country: v })} opts={options.countries} />
          <Sel label="Province/Region" value={filters.region} onChange={(v) => set({ region: v })} opts={options.regions} />
          <Sel label="Source" value={filters.source} onChange={(v) => set({ source: v })} opts={options.sources} />
          <Sel label="Device" value={filters.device} onChange={(v) => set({ device: v })} opts={options.devices} />
          <Sel label="Stage" value={filters.stage} onChange={(v) => set({ stage: v })} opts={options.stages} />
          <Sel label="Score" value={filters.scoreBand} onChange={(v) => set({ scoreBand: v })} opts={options.scoreBands} />
          {activeFilters > 0 && (
            <button type="button" onClick={() => setFilters({})} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-navy hover:bg-slate-200">
              Clear ({activeFilters})
            </button>
          )}
          <span className="ml-auto self-center text-sm text-muted">{filtered.length} of {profiles.length} people</span>
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="People" value={String(view.totals.people)} tip={SRC.site} />
        <StatCard label="Leads" value={String(view.totals.leads)} tip={SRC.site} />
        <StatCard label="Abandoned" value={String(view.totals.partials)} sub="started, no submit" tip="Your website's database — visitors who started the form but never submitted (partial beacon)." />
        <StatCard label="Lookups" value={String(lookupsTotal)} sub="all-time" tip="Your website's database — value-lookup requests, all time." />
        <StatCard label="Closed" value={String(view.totals.closed)} sub={money(view.totals.revenue)} tip="Your website's database — deals marked closed, with sale price." />
        <StatCard label="Avg response" value={fmtMins(view.totals.avgResponseMins)} tip="Your website's database — average time from lead to your first reply." />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Funnel rows={view.funnel} tip="Your website's database — how many reach each step." />
        <VBars title="Leads over time" rows={view.overTime} tip={SRC.site} />
      </div>

      <Section title="Segments — how different groups respond">
        <SegmentView rows={segments} dim={dim} setDim={setDim} tip={SRC.siteGrouped} />
      </Section>

      <Section title="Ad performance (Meta) — spend & cost-per-lead" tip="Spend/impressions/clicks from Meta Ads API; leads & cost-per-lead from the Meta Pixel; revenue & ROAS from your own closed sales.">
        <AdPerformance profiles={profiles} />
      </Section>

      <Section title="Traffic (GA4) — everyone who visited" tip={SRC.ga4}>
        <TrafficGa4 />
      </Section>

      <Section title="Site funnel & form friction — every visitor" tip={SRC.events}>
        {!ev || ev.totalEvents === 0 ? (
          <div className="card p-4 text-sm text-muted">
            <span className="font-semibold text-navy">No events collected yet.</span> Data starts flowing
            automatically once the <code className="rounded bg-slate-100 px-1">AutoOfferEvents</code> table
            exists in DynamoDB (one-time setup) — every visit after that is captured first-party.
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Funnel
                rows={ev.funnel}
                tip={SRC.events}
                title={`Every session, step by step (${ev.totalSessions.toLocaleString("en-CA")} sessions)`}
              />
              <div className="card p-4">
                <h3 className="mb-3 text-sm font-bold text-navy">
                  Median time between steps<InfoDot tip={SRC.events} />
                </h3>
                {ev.stepMedianMins.length === 0 ? (
                  <p className="text-sm text-muted">Not enough sessions yet.</p>
                ) : (
                  <div className="space-y-1.5 text-sm">
                    {ev.stepMedianMins.map((s) => (
                      <div key={s.label} className="flex justify-between gap-2">
                        <span className="text-muted">{s.label}</span>
                        <span className="font-semibold text-navy">
                          {s.mins < 1 ? `${Math.round(s.mins * 60)}s` : `${s.mins}m`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="card overflow-x-auto p-4">
                <h3 className="mb-3 text-sm font-bold text-navy">
                  Form friction — where people stop<InfoDot tip={SRC.events} />
                </h3>
                {ev.friction.length === 0 ? (
                  <p className="text-sm text-muted">No field interactions recorded yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
                        <th className="py-2 pr-2">Field</th>
                        <th className="px-2 text-right" title="Sessions that focused this field">Touched by</th>
                        <th className="pl-2 text-right" title="Abandoning sessions whose LAST touched field was this one">Abandoned here</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ev.friction.map((f) => (
                        <tr key={f.field} className="border-b border-slate-100">
                          <td className="py-2 pr-2 font-semibold capitalize text-navy">{f.field}</td>
                          <td className="px-2 text-right">{f.focuses}</td>
                          <td className="pl-2 text-right font-semibold">{f.abandons || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <HBars title="Form errors by reason" rows={ev.errorsByReason} tip={SRC.events} />
            </div>
            <div className="mt-4">
              <HBars title="Top events — what's being captured" rows={ev.topEvents} tip={SRC.events} />
            </div>
          </>
        )}
      </Section>

      <Section
        title="Retargeting — export audiences for Meta"
        tip="Your website's database (respects the filter bar). Meta hashes the uploaded file in your browser; only hashed values reach Meta, used solely for ad matching."
      >
        <MetaExport profiles={filtered} />
      </Section>

      <Section title="Geography">
        <div className="grid gap-4 lg:grid-cols-2">
          <HBars title="By country" rows={view.byCountry} tip={SRC.geo} />
          <HBars title="By province / region" rows={view.byRegion} tip={SRC.geo} />
        </div>
      </Section>

      <Section title="Acquisition">
        <div className="grid gap-4 lg:grid-cols-2">
          <HBars title="By source" rows={view.bySource} tip={SRC.siteGrouped} />
          <HBars title="By campaign" rows={view.byCampaign} tip={SRC.siteGrouped} />
        </div>
      </Section>

      <Section title="Behavior & mix">
        <div className="grid gap-4 lg:grid-cols-2">
          <HBars title="By device" rows={view.byDevice} tip={SRC.behavior} />
          <HBars title="By vehicle make" rows={view.byMake} tip={SRC.site} />
          <HBars title="By status" rows={view.byStatus} tip={SRC.site} />
          <HBars title="By contact preference" rows={view.byContactMethod} tip={SRC.site} />
        </div>
        <div className="mt-4">
          <Heatmap grid={view.heatmap} tip="Your website's database — the timestamp each lead arrived." />
        </div>
      </Section>

      <Section title={`Profiles (${list.length})`} tip={SRC.site}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input className="field max-w-xs" placeholder="Search name, phone, email, campaign, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" checked={sortByScore} onChange={(e) => setSortByScore(e.target.checked)} />
            Sort by score
          </label>
        </div>
        <div className="space-y-3">
          {list.length === 0 ? <p className="text-sm text-muted">No profiles match.</p> : list.map((p) => <ProfileRow key={p.id} p={p} onDelete={deleteProfile} />)}
        </div>
      </Section>
    </div>
  );
}
