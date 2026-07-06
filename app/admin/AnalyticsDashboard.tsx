"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AnalyticsData } from "@/lib/analyticsData";
import type { EventAnalytics } from "@/lib/eventAnalytics";
import type { Profile, AdInsight, AdInsightAd, Ga4Traffic, Touch } from "@/lib/types";
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
//  Four tabs (Overview / Acquisition / Funnel / People) driven by one sticky
//  global control bar (date range + dimension filters).
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
  events: "Your own events database (first-party) — every visitor session, anonymous ones included; nothing sent to third parties. Reflects the event window selected in the control bar above.",
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

function StatCard({ label, value, sub, tip, delta }: { label: string; value: string; sub?: string; tip?: string; delta?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}{tip && <InfoDot tip={tip} />}</div>
      <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
      {delta}
    </div>
  );
}

/** Delta chip vs the previous equal-length period (preset ranges only). */
function Delta({ now, prev }: { now: number; prev: number }) {
  const diff = now - prev;
  if (prev === 0 && diff === 0) return <div className="mt-0.5 text-[11px] text-muted">— vs prev period</div>;
  const up = diff >= 0;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  return (
    <div className={`mt-0.5 text-[11px] font-semibold ${up ? "text-emerald-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {up ? "+" : ""}{diff}{pct != null ? ` (${up ? "+" : ""}${pct}%)` : ""} <span className="font-normal text-muted">vs prev period</span>
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

/** Compact per-day mini bar chart — data-health strip. Generic value key. */
function MiniBars({ title, rows, tip }: { title: string; rows: { day: string; value: number }[]; tip?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data.</p>
      ) : (
        <div className="flex h-20 items-end gap-0.5 overflow-x-auto">
          {rows.map((r) => (
            <div key={r.day} className="min-w-[3px] flex-1 rounded-t bg-brand-600/80" style={{ height: `${(r.value / max) * 100}%` }} title={`${r.day}: ${r.value}`} />
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
      <h3 className="mb-3 text-sm font-bold text-navy">When leads arrive (day × hour, Mountain time){tip && <InfoDot tip={tip} />}</h3>
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
            <th className="px-2 text-right" title="Margin = sale price (actual, or expected if not sold yet) minus what you paid for the car, summed over the group's closed deals.">Margin</th>
            <th className="px-2 text-right" title="Average lead score (0-100) across the group">Avg score</th>
            <th className="pl-2 text-right">Median resp</th>
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
                <td className="px-2 text-right">{r.margin ? money(r.margin) : "—"}</td>
                <td className="px-2 text-right">{r.avgScore}</td>
                <td className="pl-2 text-right">{fmtMins(r.medianResponseMins)}</td>
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
            {a?.utmTerm && <Row k="Term" v={a.utmTerm} />}
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

// ---------------------------------------------------------------------------
//  Global control bar — date range presets/custom + collapsible dimension
//  filters. Drives every tab: profiles by date, Meta/GA4 by mapped range, and
//  the first-party event window.
// ---------------------------------------------------------------------------

type Preset = "7d" | "30d" | "90d" | "all" | "custom";

interface RangeState {
  preset: Preset;
  dateFrom?: string;
  dateTo?: string;
}

/** Preset → { dateFrom, dateTo } in local YYYY-MM-DD, or empty for All/custom. */
function presetDates(preset: Preset): { dateFrom?: string; dateTo?: string } {
  if (preset === "custom" || preset === "all") return {};
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  // Anchor to Mountain Time so range edges agree with the MT day bucketing in
  // the charts regardless of where the dashboard is viewed from.
  const iso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" }); // YYYY-MM-DD
  return { dateFrom: iso(from), dateTo: iso(to) };
}

/** Number of days a preset covers (for the previous-period delta shift). */
function presetDays(preset: Preset): number | null {
  return preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "90d" ? 90 : null;
}

/** Meta date_preset for the selected range. Custom/All map to the nearest of the
 * three presets Meta supports here; the caller shows a note when approximated. */
function metaRange(r: RangeState): { range: string; approx: boolean } {
  if (r.preset === "7d") return { range: "last_7d", approx: false };
  if (r.preset === "30d") return { range: "last_30d", approx: false };
  if (r.preset === "90d") return { range: "last_90d", approx: false };
  if (r.preset === "all") return { range: "last_90d", approx: true };
  // custom → span in days → nearest of 7/30/90
  const from = r.dateFrom ? Date.parse(r.dateFrom) : NaN;
  const to = r.dateTo ? Date.parse(r.dateTo) : Date.now();
  const span = Number.isFinite(from) ? (to - from) / 86_400_000 : 30;
  const nearest = [7, 30, 90].reduce((a, b) => (Math.abs(b - span) < Math.abs(a - span) ? b : a), 30);
  return { range: `last_${nearest}d`, approx: true };
}

/** GA4 days for the selected range (same nearest-of-three + note rule). */
function ga4Days(r: RangeState): { days: number; approx: boolean } {
  const m = metaRange(r);
  return { days: m.range === "last_7d" ? 7 : m.range === "last_90d" ? 90 : 30, approx: m.approx };
}

/** Smallest rolling event window that still covers the selection. */
function eventWindow(r: RangeState, ev: AnalyticsData["events"]): { data: EventAnalytics; label: string } {
  if (r.preset === "7d") return { data: ev.d7, label: "last 7 days" };
  if (r.preset === "30d") return { data: ev.d30, label: "last 30 days" };
  if (r.preset === "90d") return { data: ev.d90, label: "last 90 days" };
  if (r.preset === "all") return { data: ev.all, label: "all time" };
  // custom → smallest window covering the span
  const from = r.dateFrom ? Date.parse(r.dateFrom) : NaN;
  const to = r.dateTo ? Date.parse(r.dateTo) : Date.now();
  const span = Number.isFinite(from) ? (to - from) / 86_400_000 : 30;
  if (span <= 7) return { data: ev.d7, label: "last 7 days" };
  if (span <= 30) return { data: ev.d30, label: "last 30 days" };
  if (span <= 90) return { data: ev.d90, label: "last 90 days" };
  return { data: ev.all, label: "all time" };
}

function ControlBar({
  range,
  setRange,
  filters,
  set,
  options,
  activeFilters,
  clearFilters,
  countLabel,
}: {
  range: RangeState;
  setRange: (r: RangeState) => void;
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
  options: ReturnType<typeof computeFilterOptions>;
  activeFilters: number;
  clearFilters: () => void;
  countLabel: string;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const presets: { key: Preset; label: string }[] = [
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
    { key: "all", label: "All" },
  ];
  return (
    <div className="sticky top-0 z-40 -mx-4 mb-6 border-b border-slate-200 bg-bg/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setRange({ preset: p.key })}
              className={`px-3 py-1.5 text-sm font-semibold ${range.preset === p.key ? "bg-brand-600 text-white" : "bg-white text-navy hover:bg-slate-50"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-muted">
          From
          <input
            type="date"
            className="field py-1 text-sm"
            value={range.preset === "custom" ? range.dateFrom || "" : ""}
            onChange={(e) => setRange({ preset: "custom", dateFrom: e.target.value || undefined, dateTo: range.dateTo })}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          To
          <input
            type="date"
            className="field py-1 text-sm"
            value={range.preset === "custom" ? range.dateTo || "" : ""}
            onChange={(e) => setRange({ preset: "custom", dateFrom: range.dateFrom, dateTo: e.target.value || undefined })}
          />
        </label>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${activeFilters > 0 ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-navy hover:bg-slate-200"}`}
        >
          Filters{activeFilters > 0 ? ` (${activeFilters})` : ""} {showFilters ? "▲" : "▼"}
        </button>
        <span className="ml-auto self-center text-sm text-muted">{countLabel}</span>
      </div>
      {showFilters && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <Sel label="Country" value={filters.country} onChange={(v) => set({ country: v })} opts={options.countries} />
          <Sel label="Province/Region" value={filters.region} onChange={(v) => set({ region: v })} opts={options.regions} />
          <Sel label="Source" value={filters.source} onChange={(v) => set({ source: v })} opts={options.sources} />
          <Sel label="Device" value={filters.device} onChange={(v) => set({ device: v })} opts={options.devices} />
          <Sel label="Stage" value={filters.stage} onChange={(v) => set({ stage: v })} opts={options.stages} />
          <Sel label="Score" value={filters.scoreBand} onChange={(v) => set({ scoreBand: v })} opts={options.scoreBands} />
          {activeFilters > 0 && (
            <button type="button" onClick={clearFilters} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-navy hover:bg-slate-200">
              Clear ({activeFilters})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Funnel economics — the Overview hero. One row per Meta campaign (level=ad
//  rows grouped by campaignId), plus an untagged/organic row for profiles that
//  match no campaign. Joins DB leads to campaigns by any-touch utm_campaign.
// ---------------------------------------------------------------------------

/** Does a profile carry this campaign name on any touch (or first-touch attr)? */
function profileMatchesCampaign(p: Profile, campaign: string): boolean {
  if (!campaign) return false;
  if (p.attribution?.utmCampaign === campaign) return true;
  return (p.touchHistory || []).some((t) => t.utmCampaign === campaign);
}

/** Any campaign at all (used to bucket the organic remainder). */
function profileHasAnyCampaign(p: Profile, campaigns: Set<string>): boolean {
  if (p.attribution?.utmCampaign && campaigns.has(p.attribution.utmCampaign)) return true;
  return (p.touchHistory || []).some((t) => t.utmCampaign && campaigns.has(t.utmCampaign));
}

function FunnelEconomics({
  profiles,
  ads,
  configured,
  dateBounds,
}: {
  profiles: Profile[];
  ads: AdInsightAd[];
  configured: boolean;
  dateBounds: { dateFrom?: string; dateTo?: string };
}) {
  const rows = useMemo(() => {
    // Margin counts deals CLOSED inside the selected window (same attribution
    // window as the Acquisition campaign table), not deals whose LEAD arrived
    // in it — otherwise the two tabs report different mROAS for one campaign.
    const from = dateBounds.dateFrom ? Date.parse(dateBounds.dateFrom + "T00:00:00") : null;
    const to = dateBounds.dateTo ? Date.parse(dateBounds.dateTo + "T23:59:59") : null;
    const closedInRange = (p: Profile) => {
      if (from == null && to == null) return p.stage === "closed" || Boolean(p.closedAt);
      if (!p.closedAt) return false;
      const t = Date.parse(p.closedAt);
      if (!Number.isFinite(t)) return false;
      if (from != null && t < from) return false;
      if (to != null && t > to) return false;
      return true;
    };
    // Group level=ad rows into campaigns (spend/impr/link-clicks summed).
    const byCampaign = new Map<string, { campaignId: string; campaign: string; spend: number; impressions: number; linkClicks: number }>();
    for (const ad of ads) {
      const key = ad.campaignId || ad.campaign;
      const row = byCampaign.get(key) || { campaignId: ad.campaignId, campaign: ad.campaign, spend: 0, impressions: 0, linkClicks: 0 };
      row.spend += ad.spend;
      row.impressions += ad.impressions;
      row.linkClicks += ad.linkClicks;
      if (!row.campaign || row.campaign === "(unnamed)") row.campaign = ad.campaign;
      byCampaign.set(key, row);
    }
    const campaignNames = new Set([...byCampaign.values()].map((c) => c.campaign));

    const build = (
      label: string,
      spend: number,
      impressions: number,
      linkClicks: number,
      matched: Profile[],
    ) => {
      const leads = matched.length;
      const qualified = matched.filter((p) => p.score >= 70).length;
      const booked = matched.filter((p) => p.scheduledAt || p.appointmentAt || p.stage === "scheduled" || p.stage === "closed").length;
      const closedP = matched.filter(closedInRange);
      const margin = closedP.reduce((s, p) => s + (p.margin || 0), 0);
      return {
        label,
        spend,
        impressions,
        linkClicks,
        leads,
        cpl: leads ? spend / leads : null,
        qualified,
        cpql: qualified ? spend / qualified : null,
        booked,
        costBooked: booked ? spend / booked : null,
        closed: closedP.length,
        margin,
        mroas: spend ? margin / spend : null,
      };
    };

    const out = [...byCampaign.values()]
      .sort((a, b) => b.spend - a.spend)
      .map((c) => build(c.campaign, c.spend, c.impressions, c.linkClicks, profiles.filter((p) => profileMatchesCampaign(p, c.campaign))));

    // Organic / untagged remainder — profiles matching no known campaign.
    const organic = profiles.filter((p) => !profileHasAnyCampaign(p, campaignNames));
    out.push(build("(untagged / organic)", 0, 0, 0, organic));
    return out;
  }, [profiles, ads, dateBounds]);

  return (
    <div className="card overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">
          Funnel economics — per campaign
          <InfoDot tip="Spend / impressions / link clicks come from Meta (level=ad rows, grouped by campaign). Leads, qualified, booked, closed & margin come from YOUR database, matched to the campaign by any UTM touch (utm_campaign={{campaign.name}}). Untagged / organic = leads matching no Meta campaign." />
        </h3>
      </div>
      {!configured && (
        <p className="mb-3 text-xs text-muted">
          <span className="font-semibold text-navy">Meta not connected</span> — spend columns read zero. DB-side columns (leads/qualified/booked/closed/margin) still populate.
        </p>
      )}
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-2" title="Meta campaign name.">Campaign</th>
            <th className="px-2 text-right" title="Meta Ads API — amount spent.">Spend</th>
            <th className="px-2 text-right" title="Meta Ads API — times shown.">Impr.</th>
            <th className="px-2 text-right" title="Meta Ads API — inline link clicks.">Link clicks</th>
            <th className="px-2 text-right" title="Your database — people who created a real lead in range, matched to this campaign by any UTM touch.">Leads</th>
            <th className="px-2 text-right" title="Spend ÷ DB leads.">CPL</th>
            <th className="px-2 text-right" title="Your database — matched leads with a lead score of 70 or higher.">Qualified</th>
            <th className="px-2 text-right" title="Spend ÷ qualified leads.">CPQL</th>
            <th className="px-2 text-right" title="Your database — matched leads that reached booked/closed.">Booked</th>
            <th className="px-2 text-right" title="Spend ÷ booked.">Cost/booked</th>
            <th className="px-2 text-right" title="Your database — matched closed deals.">Closed</th>
            <th className="px-2 text-right" title="Margin from matched deals closed in range = sale price (actual, or expected) minus cost.">Margin</th>
            <th className="pl-2 text-right" title="Margin ÷ spend.">mROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={13} className="py-3 text-muted">No campaigns or leads in range.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.label} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-semibold text-navy">{r.label}</td>
                <td className="px-2 text-right">{r.spend ? money(r.spend) : "—"}</td>
                <td className="px-2 text-right">{r.impressions ? r.impressions.toLocaleString("en-CA") : "—"}</td>
                <td className="px-2 text-right">{r.linkClicks ? r.linkClicks.toLocaleString("en-CA") : "—"}</td>
                <td className="px-2 text-right font-semibold">{r.leads}</td>
                <td className="px-2 text-right">{money2(r.cpl)}</td>
                <td className="px-2 text-right">{r.qualified}</td>
                <td className="px-2 text-right">{money2(r.cpql)}</td>
                <td className="px-2 text-right">{r.booked}</td>
                <td className="px-2 text-right">{money2(r.costBooked)}</td>
                <td className="px-2 text-right">{r.closed}</td>
                <td className="px-2 text-right">{r.margin ? money(r.margin) : "—"}</td>
                <td className="pl-2 text-right">{r.mroas != null ? `${r.mroas.toFixed(1)}×` : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Spend/impressions/link-clicks from Meta (grouped from level=ad rows). Leads, qualified (score ≥ 70), booked, closed &amp; margin come from your own database, matched to the campaign by any UTM touch — ads must carry <code className="rounded bg-slate-100 px-1">utm_campaign={"{{campaign.name}}"}</code> for the join to work. Untagged / organic collects leads that match no Meta campaign.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Meta campaign table (Acquisition) — link-clicks-honest spend/CPL/ROAS,
//  driven by the campaign-level insights fetch.
// ---------------------------------------------------------------------------

function MetaCampaignTable({ profiles, insights, days }: { profiles: Profile[]; insights: AdInsight[]; days: number }) {
  const rows = useMemo(() => {
    const cutoff = Date.now() - days * 86_400_000;
    return insights.map((ins) => {
      const ps = profiles.filter(
        (p) => p.attribution?.utmCampaign === ins.campaign || (p.touchHistory || []).some((t) => t.utmCampaign === ins.campaign),
      );
      const margin = ps
        .filter((p) => p.stage === "closed" && p.closedAt && Date.parse(p.closedAt) >= cutoff)
        .reduce((s, p) => s + (p.margin || 0), 0);
      const leads = ins.leads ?? 0;
      const cpl = ins.costPerLead ?? (leads ? ins.spend / leads : null);
      return { ...ins, leads, margin, cpl, roas: ins.spend ? margin / ins.spend : null };
    });
  }, [insights, profiles, days]);

  return (
    <div className="card overflow-x-auto p-4">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-2" title="Campaign name from Meta.">Campaign</th>
            <th className="px-2 text-right" title="Meta Ads API — amount spent.">Spend</th>
            <th className="px-2 text-right" title="Meta Ads API — times your ad was shown.">Impr.</th>
            <th className="px-2 text-right" title="Meta Ads API — link clicks.">Link clicks</th>
            <th className="px-2 text-right" title="Meta Ads API — link click-through rate.">CTR</th>
            <th className="px-2 text-right" title="Meta Pixel — leads Meta attributes to the ad.">Leads</th>
            <th className="px-2 text-right" title="Meta ad spend ÷ Meta Pixel leads.">Cost/lead</th>
            <th className="px-2 text-right" title="Margin from deals CLOSED in the selected window, matched to this campaign by any UTM touch (ads must carry utm_campaign={campaign.name}).">Margin</th>
            <th className="pl-2 text-right" title="Margin ÷ spend.">ROAS</th>
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
                <td className="px-2 text-right">{r.margin ? money(r.margin) : "—"}</td>
                <td className="pl-2 text-right">{r.roas != null ? `${r.roas.toFixed(1)}×` : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Spend, leads &amp; cost-per-lead come straight from Meta (matches Ads Manager). Margin from deals closed in the selected window, matched to this campaign by any UTM touch (ads must carry utm_campaign={"{campaign.name}"}).</p>
    </div>
  );
}

/** Creative-level table from level=ad rows: link CTR + hook/hold + Meta leads. */
function CreativeTable({ ads }: { ads: AdInsightAd[] }) {
  const rows = useMemo(() => [...ads].sort((a, b) => b.spend - a.spend), [ads]);
  return (
    <div className="card overflow-x-auto p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">
        Creative performance — per ad
        <InfoDot tip="Meta Ads API (level=ad). Hook % = 3-second plays ÷ impressions; Hold % = ThruPlays ÷ 3-second plays. Image ads have no video metrics — shown as —." />
      </h3>
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-2" title="Ad (creative) name.">Ad</th>
            <th className="px-2" title="Ad set name.">Ad set</th>
            <th className="px-2 text-right" title="Meta Ads API — amount spent.">Spend</th>
            <th className="px-2 text-right" title="Meta Ads API — times shown.">Impr.</th>
            <th className="px-2 text-right" title="Meta Ads API — link click-through rate.">Link CTR</th>
            <th className="px-2 text-right" title="3-second video plays ÷ impressions.">Hook %</th>
            <th className="px-2 text-right" title="ThruPlays ÷ 3-second video plays.">Hold %</th>
            <th className="px-2 text-right" title="Meta Pixel leads attributed to this ad.">Leads</th>
            <th className="pl-2 text-right" title="Meta spend ÷ Meta leads.">CPL</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9} className="py-3 text-muted">No ads in range.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.adId || r.ad} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-semibold text-navy" title={r.ad}>{r.ad}</td>
                <td className="px-2 text-muted" title={r.adset}>{r.adset}</td>
                <td className="px-2 text-right">{money(r.spend)}</td>
                <td className="px-2 text-right">{r.impressions.toLocaleString("en-CA")}</td>
                <td className="px-2 text-right">{r.linkCtr != null ? `${r.linkCtr.toFixed(1)}%` : "—"}</td>
                <td className="px-2 text-right">{r.hookRate != null ? `${r.hookRate.toFixed(1)}%` : "—"}</td>
                <td className="px-2 text-right">{r.holdRate != null ? `${r.holdRate.toFixed(1)}%` : "—"}</td>
                <td className="px-2 text-right">{r.leads ?? "—"}</td>
                <td className="pl-2 text-right font-semibold">{money2(r.costPerLead ?? (r.leads ? r.spend / r.leads : null))}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
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

function TrafficGa4({ days, approx }: { days: number; approx: boolean }) {
  const [data, setData] = useState<{ configured: boolean; traffic: Ga4Traffic | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState(""); // "" = all countries
  const [filtered, setFiltered] = useState<Ga4Traffic | null>(null);
  const [filtering, setFiltering] = useState(false);

  // Unfiltered load — drives the country dropdown options + the "By country"
  // breakdown chart (always the full picture).
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

  // Per-country load — when a country is picked, re-fetch constrained to it so
  // the totals, sources, and device mix reflect just that country (e.g. US organic).
  useEffect(() => {
    if (!country) { setFiltered(null); return; }
    let cancelled = false;
    setFiltering(true);
    fetch(`/api/admin/ga4?days=${days}&country=${encodeURIComponent(country)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setFiltered(d?.traffic || null); })
      .catch(() => { if (!cancelled) setFiltered(null); })
      .finally(() => { if (!cancelled) setFiltering(false); });
    return () => { cancelled = true; };
  }, [country, days]);

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
  const full = data.traffic;
  const t = country ? filtered || full : full;
  const n = (x: number) => x.toLocaleString("en-CA");
  const countryOptions = full.byCountry.map((c) => c.label).filter((l) => l && l !== "(unknown)");
  return (
    <div className="space-y-4">
      {approx && (
        <p className="text-xs text-amber-700">Approximated to the nearest GA4 window ({days} days) — GA4 here supports 7/30/90-day ranges only.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-muted">Country</label>
        <select className="field w-auto py-1 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {filtering && <span className="text-xs text-muted">updating…</span>}
        {country && !filtering && <span className="text-xs text-muted">Visitor numbers below are {country} only</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Visitors" value={n(t.totals.users)} tip={SRC.ga4} />
        <StatCard label="New visitors" value={n(t.totals.newUsers)} tip={SRC.ga4} />
        <StatCard label="Sessions" value={n(t.totals.sessions)} tip={SRC.ga4} />
        <StatCard label="Pageviews" value={n(t.totals.pageviews)} tip={SRC.ga4} />
        <StatCard label="Engagement" value={`${Math.round(t.totals.engagementRate * 100)}%`} tip="Google Analytics 4 — share of engaged sessions (GA4's engagement rate)." />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <VBars title="Visitors over time" rows={t.overTime.map((o) => ({ date: o.date, leads: o.users }))} tip={SRC.ga4} />
        <HBars title={country ? `Traffic sources — sessions (${country})` : "Traffic sources — sessions"} rows={t.bySource.map((s) => ({ label: s.label, count: s.sessions }))} tip={SRC.ga4} />
        <HBars title={country ? `Traffic sources — visitors (${country})` : "Traffic sources — visitors"} rows={t.bySource.map((s) => ({ label: s.label, count: s.users }))} tip={SRC.ga4} />
        <HBars title="By country" rows={full.byCountry.map((c) => ({ label: c.label, count: c.users }))} tip={SRC.ga4} />
        <HBars title={country ? `By device (${country})` : "By device"} rows={t.byDevice.map((d) => ({ label: d.label, count: d.users }))} tip={SRC.ga4} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Data-health strip (Overview) — events/day + sessions/day mini charts, a DB
//  vs site reconciliation chip, and connector status chips.
// ---------------------------------------------------------------------------

function DataHealth({
  ev,
  windowLabel,
  dbLeads,
  metaConfigured,
  ga4Configured,
}: {
  ev: EventAnalytics;
  windowLabel: string;
  dbLeads: number;
  metaConfigured: boolean | null;
  ga4Configured: boolean | null;
}) {
  // Site "generate_lead" sessions in the window = the funnel's Submitted stage.
  const siteLeads = ev.funnel.find((f) => f.label === "Submitted")?.count ?? 0;
  const diverge = siteLeads > 0 && Math.abs(dbLeads - siteLeads) / siteLeads > 0.25;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <MiniBars title={`Events per day (${windowLabel})`} rows={ev.eventsPerDay.map((d) => ({ day: d.day, value: d.events }))} tip={SRC.events} />
        <MiniBars title={`Sessions per day (${windowLabel})`} rows={ev.eventsPerDay.map((d) => ({ day: d.day, value: d.sessions }))} tip={SRC.events} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-3 py-1 font-semibold ${diverge ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-navy"}`}
          title="DB leads = people who created a real lead in range. Site generate_lead = distinct sessions that reached the Submitted stage in the selected event window. A >25% gap flags a tracking/attribution mismatch."
        >
          {diverge ? "⚠ " : ""}DB leads {dbLeads} vs site generate_lead {siteLeads}
        </span>
        <span className={`rounded-full px-3 py-1 font-semibold ${metaConfigured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          Meta {metaConfigured ? "✓" : "—"}
        </span>
        <span className={`rounded-full px-3 py-1 font-semibold ${ga4Configured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          GA4 {ga4Configured ? "✓" : "—"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Funnel-tab widgets driven by the first-party event window.
// ---------------------------------------------------------------------------

function EventDetails({ ev, windowLabel }: { ev: EventAnalytics; windowLabel: string }) {
  const exitClickRate = ev.exitIntent.shown ? Math.round((ev.exitIntent.clicked / ev.exitIntent.shown) * 100) : null;
  const resumeClickRate = ev.resume.shown ? Math.round((ev.resume.clicked / ev.resume.shown) * 100) : null;
  const vinFailPct = ev.vin.submitted ? Math.round((ev.vin.failed / ev.vin.submitted) * 100) : null;
  return (
    <>
      <p className="mb-3 text-xs text-muted">Event window: {windowLabel}.<InfoDot tip={SRC.events} /></p>
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
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <HBars title="Phone clicks by placement" rows={ev.phoneClicks} tip={SRC.events} />
        <div className="card overflow-x-auto p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">
            CTA → form drop-off, by placement<InfoDot tip={SRC.events} />
          </h3>
          {ev.ctaPairs.length === 0 ? (
            <p className="text-sm text-muted">No CTA clicks recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2">Placement</th>
                  <th className="px-2 text-right" title="cta_click events at this placement">Clicks</th>
                  <th className="px-2 text-right" title="offer_flow_start events crediting this placement">Form loads</th>
                  <th className="pl-2 text-right" title="Share of clicks that never loaded the form">Drop-off %</th>
                </tr>
              </thead>
              <tbody>
                {ev.ctaPairs.map((c) => {
                  const drop = c.ctaClicks ? Math.round(((c.ctaClicks - c.flowStarts) / c.ctaClicks) * 100) : null;
                  return (
                    <tr key={c.label} className="border-b border-slate-100">
                      <td className="py-2 pr-2 font-semibold text-navy" title={c.label}>{c.label}</td>
                      <td className="px-2 text-right">{c.ctaClicks}</td>
                      <td className="px-2 text-right">{c.flowStarts}</td>
                      <td className="pl-2 text-right font-semibold">{drop != null ? `${Math.max(0, drop)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">
            Recovery features<InfoDot tip={SRC.events} />
          </h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted">Exit-intent shown</span><span className="font-semibold text-navy">{ev.exitIntent.shown}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">Exit-intent clicked</span><span className="font-semibold text-navy">{ev.exitIntent.clicked}{exitClickRate != null ? ` (${exitClickRate}%)` : ""}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">Exit-intent email captured</span><span className="font-semibold text-navy">{ev.exitIntent.emailCaptured}</span></div>
            <div className="flex justify-between gap-2 border-t border-slate-100 pt-1.5"><span className="text-muted">Resume banner shown</span><span className="font-semibold text-navy">{ev.resume.shown}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">Resume banner clicked</span><span className="font-semibold text-navy">{ev.resume.clicked}{resumeClickRate != null ? ` (${resumeClickRate}%)` : ""}</span></div>
          </div>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">
            VIN health<InfoDot tip={SRC.events} />
          </h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted">Submitted</span><span className="font-semibold text-navy">{ev.vin.submitted}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">Failed</span><span className={`font-semibold ${vinFailPct != null && vinFailPct > 25 ? "text-red-600" : "text-navy"}`}>{ev.vin.failed}{vinFailPct != null ? ` (${vinFailPct}%)` : ""}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">Confirmed</span><span className="font-semibold text-navy">{ev.vin.confirmed}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">Rejected</span><span className="font-semibold text-navy">{ev.vin.rejected}</span></div>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <HBars title="Top events — what's being captured" rows={ev.topEvents} tip={SRC.events} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

type Tab = "overview" | "acquisition" | "funnel" | "people";

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const events = data.events;
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<RangeState>({ preset: "30d" });
  const [filters, setFilters] = useState<Filters>({});
  const [dim, setDim] = useState<SegmentDimension>("source");
  const [q, setQ] = useState("");
  const [sortByScore, setSortByScore] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  // Profiles deleted this session vanish immediately (also archived server-side,
  // so they stay gone on refresh and drop out of every chart below).
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const profiles = useMemo(() => data.profiles.filter((p) => !deletedIds.has(p.id)), [data.profiles, deletedIds]);

  // Lazily-fetched connector data — driven by the mapped global range.
  const meta = metaRange(range);
  const ga4 = ga4Days(range);
  const [ads, setAds] = useState<{ configured: boolean; insights: AdInsight[] } | null>(null);
  const [adLevel, setAdLevel] = useState<{ configured: boolean; ads: AdInsightAd[] } | null>(null);
  // Just the GA4 configured flag, for the Overview data-health connector chip
  // (the full traffic report is fetched lazily inside TrafficGa4 on Acquisition).
  const [ga4Ok, setGa4Ok] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/ads?range=${meta.range}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAds(d); })
      .catch(() => { if (!cancelled) setAds({ configured: false, insights: [] }); });
    fetch(`/api/admin/ads?range=${meta.range}&level=ad`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setAdLevel(d); })
      .catch(() => { if (!cancelled) setAdLevel({ configured: false, ads: [] }); });
    return () => { cancelled = true; };
  }, [meta.range]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/ga4?days=${ga4.days}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setGa4Ok(Boolean(d?.configured)); })
      .catch(() => { if (!cancelled) setGa4Ok(false); });
    return () => { cancelled = true; };
  }, [ga4.days]);

  const metaConfigured = ads?.configured ?? adLevel?.configured ?? null;

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

  // Date bounds the active range maps to (drives profile filtering + zero-fill).
  const dateBounds = useMemo(() => {
    if (range.preset === "custom") return { dateFrom: range.dateFrom, dateTo: range.dateTo };
    if (range.preset === "all") return {};
    return presetDates(range.preset);
  }, [range]);

  const effectiveFilters = useMemo<Filters>(() => ({ ...filters, dateFrom: dateBounds.dateFrom, dateTo: dateBounds.dateTo }), [filters, dateBounds]);

  const options = useMemo(() => computeFilterOptions(profiles), [profiles]);
  const filtered = useMemo(() => filterProfiles(profiles, effectiveFilters), [profiles, effectiveFilters]);
  const view = useMemo(() => computeView(filtered, dateBounds), [filtered, dateBounds]);
  const segments = useMemo(() => segmentTable(filtered, dim), [filtered, dim]);

  // Previous equal-length period (preset ranges only) — for KPI deltas.
  const prevView = useMemo(() => {
    const days = presetDays(range.preset);
    if (days == null) return null;
    const shift = days * 86_400_000;
    const shiftIso = (iso?: string) => (iso ? new Date(Date.parse(iso + "T12:00:00Z") - shift).toISOString().slice(0, 10) : undefined);
    const prevFilters: Filters = { ...filters, dateFrom: shiftIso(dateBounds.dateFrom), dateTo: shiftIso(dateBounds.dateTo) };
    return computeView(filterProfiles(profiles, prevFilters));
  }, [range.preset, filters, dateBounds, profiles]);

  const evWindow = useMemo(() => eventWindow(range, events), [range, events]);

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

  // Reset pagination whenever the visible list changes shape.
  useEffect(() => { setVisibleCount(50); }, [q, sortByScore, filtered]);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  // Only the dimension filters count here — the date range lives in its own control.
  const activeFilters = [filters.country, filters.region, filters.source, filters.device, filters.stage, filters.scoreBand].filter(Boolean).length;

  const booked = view.funnelByRank.booked;
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "acquisition", label: "Acquisition" },
    { key: "funnel", label: "Funnel" },
    { key: "people", label: "People" },
  ];

  return (
    <div className="container-x py-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Customer Analytics</h1>
          <p className="text-sm text-muted">One profile per person — ad → visit → form → replies → close.</p>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-brand-600 hover:underline">← Leads</Link>
      </div>

      <ControlBar
        range={range}
        setRange={setRange}
        filters={filters}
        set={set}
        options={options}
        activeFilters={activeFilters}
        clearFilters={() => setFilters({})}
        countLabel={`${filtered.length} of ${profiles.length} people`}
      />

      {/* Tab strip */}
      <div className="mb-6 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-navy"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- TAB 1: OVERVIEW ---- */}
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Leads" value={String(view.totals.leads)} tip={SRC.site} delta={prevView ? <Delta now={view.totals.leads} prev={prevView.totals.leads} /> : undefined} />
            <StatCard label="Booked" value={String(booked)} tip="Your website's database — leads that reached a booked inspection (scheduled or closed)." delta={prevView ? <Delta now={booked} prev={prevView.funnelByRank.booked} /> : undefined} />
            <StatCard label="Closed" value={String(view.totals.closed)} sub={`${money(view.totals.margin)} margin`} tip="Deals marked closed. Margin = sale price (actual, or expected if not sold yet) minus what you paid for the car." delta={prevView ? <Delta now={view.totals.closed} prev={prevView.totals.closed} /> : undefined} />
            <StatCard
              label="Speed to lead"
              value={fmtMins(view.totals.medianResponseMins)}
              sub={view.totals.pctUnder5Min != null ? `${view.totals.pctUnder5Min}% under 5 min` : undefined}
              tip="Median time from lead submitted to your first real contact (offer sent or marked contacted). Industry research: responding inside 5 minutes multiplies qualification rates ~21x."
            />
            <StatCard label="People" value={String(view.totals.people)} tip={SRC.site} delta={prevView ? <Delta now={view.totals.people} prev={prevView.totals.people} /> : undefined} />
            <StatCard label="Abandoned" value={String(view.totals.partials)} sub="started, no submit" tip="Your website's database — visitors who started the form but never submitted (partial beacon)." delta={prevView ? <Delta now={view.totals.partials} prev={prevView.totals.partials} /> : undefined} />
          </div>

          <Section title="Funnel economics — spend to margin, per campaign">
            {meta.approx && (
              <p className="mb-2 text-xs text-amber-700">Meta spend approximated to {meta.range.replace("last_", "").replace("d", " days")} — Meta here supports 7/30/90-day windows only.</p>
            )}
            <FunnelEconomics profiles={filtered} ads={adLevel?.ads || []} configured={Boolean(adLevel?.configured)} dateBounds={dateBounds} />
          </Section>

          <Section title="Data health" tip={SRC.events}>
            {!events.all || events.all.totalEvents === 0 ? (
              <div className="card p-4 text-sm text-muted">
                <span className="font-semibold text-navy">No events collected yet.</span> Data starts flowing
                automatically once the <code className="rounded bg-slate-100 px-1">AutoOfferEvents</code> table
                exists in DynamoDB (one-time setup) — every visit after that is captured first-party.
              </div>
            ) : (
              <DataHealth
                ev={evWindow.data}
                windowLabel={evWindow.label}
                dbLeads={view.totals.leads}
                metaConfigured={metaConfigured}
                ga4Configured={ga4Ok}
              />
            )}
          </Section>
        </>
      )}

      {/* ---- TAB 2: ACQUISITION ---- */}
      {tab === "acquisition" && (
        <>
          <Section title="Ad performance (Meta) — spend & cost-per-lead" tip="Spend/impressions/link-clicks from Meta Ads API; leads & cost-per-lead from the Meta Pixel; margin & ROAS from your own closed deals.">
            {meta.approx && (
              <p className="mb-2 text-xs text-amber-700">Meta spend approximated to {meta.range.replace("last_", "").replace("d", " days")} — Meta here supports 7/30/90-day windows only.</p>
            )}
            {ads === null ? (
              <div className="card p-4 text-sm text-muted">Loading ad performance…</div>
            ) : !ads.configured ? (
              <div className="card p-4 text-sm text-muted">
                <span className="font-semibold text-navy">Meta ads not connected yet.</span> Add{" "}
                <code className="rounded bg-slate-100 px-1">META_MARKETING_TOKEN</code> and{" "}
                <code className="rounded bg-slate-100 px-1">META_AD_ACCOUNT_ID</code> in Amplify to see spend, cost-per-lead, and ROAS here.
              </div>
            ) : (
              <MetaCampaignTable profiles={profiles} insights={ads.insights} days={ga4.days} />
            )}
          </Section>

          <Section title="Creative — ad-level performance & hook/hold" tip="Meta Ads API (level=ad).">
            {adLevel === null ? (
              <div className="card p-4 text-sm text-muted">Loading creative…</div>
            ) : !adLevel.configured ? (
              <div className="card p-4 text-sm text-muted">Meta ads not connected — creative metrics appear once the Marketing API is configured.</div>
            ) : (
              <CreativeTable ads={adLevel.ads} />
            )}
          </Section>

          <Section title="Traffic (GA4) — everyone who visited" tip={SRC.ga4}>
            <TrafficGa4 days={ga4.days} approx={ga4.approx} />
          </Section>

          <Section title="Acquisition">
            <div className="grid gap-4 lg:grid-cols-2">
              <HBars title="By source" rows={view.bySource} tip={SRC.siteGrouped} />
              <HBars title="By campaign" rows={view.byCampaign} tip={SRC.siteGrouped} />
            </div>
          </Section>

          <Section
            title="Retargeting — export audiences for Meta"
            tip="Your website's database (respects the filter bar). Meta hashes the uploaded file in your browser; only hashed values reach Meta, used solely for ad matching."
          >
            <MetaExport profiles={filtered} />
          </Section>
        </>
      )}

      {/* ---- TAB 3: FUNNEL ---- */}
      {tab === "funnel" && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Funnel rows={view.funnel} tip="Your website's database — how many reach each step." />
            <VBars title="Leads over time" rows={view.overTime} tip={SRC.site} />
          </div>
          <div className="mt-4">
            <Heatmap grid={view.heatmap} tip="Your website's database — the timestamp each lead arrived (Mountain time)." />
          </div>

          <Section title="Site funnel & form friction — every visitor" tip={SRC.events}>
            {!evWindow.data || evWindow.data.totalEvents === 0 ? (
              <div className="card p-4 text-sm text-muted">
                <span className="font-semibold text-navy">No events in this window.</span> Data starts flowing
                automatically once the <code className="rounded bg-slate-100 px-1">AutoOfferEvents</code> table
                exists in DynamoDB (one-time setup) — every visit after that is captured first-party.
              </div>
            ) : (
              <EventDetails ev={evWindow.data} windowLabel={evWindow.label} />
            )}
          </Section>
        </>
      )}

      {/* ---- TAB 4: PEOPLE ---- */}
      {tab === "people" && (
        <>
          <Section title="Segments — how different groups respond">
            <SegmentView rows={segments} dim={dim} setDim={setDim} tip={SRC.siteGrouped} />
          </Section>

          <Section title="Geography">
            <div className="grid gap-4 lg:grid-cols-2">
              <HBars title="By country" rows={view.byCountry} tip={SRC.geo} />
              <HBars title="By province / region" rows={view.byRegion} tip={SRC.geo} />
            </div>
          </Section>

          <Section title="Behavior & mix">
            <div className="grid gap-4 lg:grid-cols-2">
              <HBars title="By device" rows={view.byDevice} tip={SRC.behavior} />
              <HBars title="By vehicle make" rows={view.byMake} tip={SRC.site} />
              <HBars title="By status" rows={view.byStatus} tip={SRC.site} />
              <HBars title="By contact preference" rows={view.byContactMethod} tip={SRC.site} />
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
              {list.length === 0 ? (
                <p className="text-sm text-muted">No profiles match.</p>
              ) : (
                list.slice(0, visibleCount).map((p) => <ProfileRow key={p.id} p={p} onDelete={deleteProfile} />)
              )}
            </div>
            {list.length > visibleCount && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + 50)}
                  className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-navy hover:bg-slate-200"
                >
                  Show more ({list.length - visibleCount} more)
                </button>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
