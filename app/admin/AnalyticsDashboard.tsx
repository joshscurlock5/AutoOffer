"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AnalyticsData } from "@/lib/analyticsData";
import type { EventAnalytics } from "@/lib/eventAnalytics";
import type { Profile, AdInsight, AdInsightAd, Ga4Traffic, Touch, ClarityInsights } from "@/lib/types";
import type { AdInsightAdRanked, RegionInsightRow, PlacementInsightRow } from "@/lib/metaAds";
import { DATA_SOURCES, STATUS_META, type SourceHealth, type SourceStatus, type SourceCategory } from "@/lib/dataSources";
import { tagsFor, TAG_META, EFFORT_META, TAG_ORDER, type EffortTag } from "@/lib/dataSourceTags";
import { useStatusFor, USE_STATUS_META } from "@/lib/dataSourceStatus";
import {
  computeView,
  filterProfiles,
  computeFilterOptions,
  segmentTable,
  scoreBand,
  SEGMENT_DIMENSIONS,
  byLandingPath,
  abandonersBySource,
  campaignVehicle,
  warmAbandoners,
  type Filters,
  type SegmentDimension,
  type Count,
} from "@/lib/analyticsView";
import { META_SEGMENTS, segmentProfiles, buildMetaCsv, type MetaSegment } from "@/lib/metaExport";
import EmailsTab from "./EmailsTab";

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

// Tiny "est" marker for a margin/ROAS figure that still includes a car you've
// bought but not yet sold — the number uses your EXPECTED resale until the real
// sold price is recorded, at which point it firms up and this tag drops.
function EstBadge() {
  return (
    <span
      className="ml-1 align-middle rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
      title="Estimate — includes deals you've bought but not sold yet. Margin uses your expected resale until you enter the actual sold price."
    >
      est
    </span>
  );
}

// Provenance strings for the "where's this from?" info dots (an audit aid).
const SRC = {
  site: "Your website's own database — form submissions, merged into one record per person.",
  siteGrouped: "Your website's database, grouped by the source saved on each lead (the tracking tag on the ad link, or the website that sent them here).",
  behavior: "Tracking built into your own website — pages viewed, device, and time on site.",
  geo: "IP-address location lookup (ipwho.is), added shortly after each lead arrives.",
  ga4: "Google Analytics 4 — every site visitor, including anonymous ones who never filled a form.",
  comms: "Delivery receipts from Resend (email) and Twilio (SMS) — whether messages we sent arrived, were opened, or had a link clicked.",
  clarity: "Microsoft Clarity session recordings. In Clarity, add the filter Custom user ID = this session ID to watch this person's visits.",
  events: "Your own website's activity log — every visit, anonymous ones included; nothing sent to third parties. Covers the activity date range selected in the control bar above.",
  journey: "Your website's database — every place this person arrived from, oldest to newest. First chip = where they first found you.",
  score: "Computed from this person's own activity — how recently they visited, how much they did on the site, how far they got in the form, vehicle value, and where they came from. Not machine learning; every point is explained in the breakdown inside the profile. A guide to who to call first, not a prediction.",
  enrich: "Worked out from data the customer already gave us — email provider type, phone area-code region, and a vehicle value tier. No extra questions asked, no outside services.",
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

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-07-12" -> "Jul 12". Split the string — never Date.parse an ISO day
// (parses as UTC midnight, which shifts the day in Mountain time).
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

// "2026-07-12" -> "Sun, Jul 12" — for the hover readout.
function dayLabelFull(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${WEEKDAYS_SHORT[new Date(y, m - 1, d).getDay()]}, ${MONTHS_SHORT[m - 1]} ${d}`;
}

// Smallest "nice" axis max ({1,2,2.5,5}×10^k) at or above the data max.
function niceCeil(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

/**
 * Shared per-day bar chart: labeled Y axis, date labels under the bars, an
 * always-visible summary line that becomes a per-day readout on hover, and a
 * 7-day moving-average overlay once there are 2+ weeks of days. Div-based so
 * it stays responsive with zero measurement code.
 */
function DayBarChart({
  rows,
  height = 112,
  format,
  unit = "",
  accent = "bg-brand-600/80",
}: {
  rows: { label: string; value: number }[];
  height?: number;
  format?: (n: number) => string;
  unit?: string;
  accent?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (rows.length === 0) return null;
  const fmt = format ?? ((n: number) => n.toLocaleString("en-CA"));
  const values = rows.map((r) => r.value);
  const niceMax = niceCeil(Math.max(0, ...values));
  const total = values.reduce((s, v) => s + v, 0);
  const peak = Math.max(0, ...values);
  const avg = total / rows.length;
  const avgLabel = format ? format(avg) : avg.toFixed(1);
  const showAvg = rows.length >= 14;
  const avgPts = showAvg
    ? values.map((_, i) => {
        const win = values.slice(Math.max(0, i - 6), i + 1);
        return win.reduce((s, v) => s + v, 0) / win.length;
      })
    : [];
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
  const last = rows.length - 1;
  const hoveredRow = hovered != null ? rows[hovered] : null;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] text-muted">{showAvg ? "— trend line (7-day average)" : ""}</span>
        <span className="text-right text-xs tabular-nums text-muted">
          {hoveredRow ? (
            <>
              <span className="font-semibold text-navy">{dayLabelFull(hoveredRow.label)}</span> · {fmt(hoveredRow.value)}{unit ? ` ${unit}` : ""}
            </>
          ) : (
            <>total {fmt(total)} · peak {fmt(peak)} · avg {avgLabel}/day</>
          )}
        </span>
      </div>
      <div className="flex">
        <div className="flex w-10 shrink-0 flex-col justify-between pr-1 text-right text-[10px] leading-none tabular-nums text-muted" style={{ height }}>
          <span>{fmt(niceMax)}</span>
          <span>{fmt(niceMax / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1" style={{ height }}>
          <div className="absolute inset-x-0 top-0 border-t border-slate-100" />
          <div className="absolute inset-x-0 top-1/4 border-t border-slate-100/70" />
          <div className="absolute inset-x-0 top-1/2 border-t border-slate-100" />
          <div className="absolute inset-x-0 top-3/4 border-t border-slate-100/70" />
          <div className="relative flex h-full items-end gap-[2px]">
            {rows.map((r, i) => (
              <div
                key={r.label}
                className={`min-w-[3px] flex-1 rounded-t ${r.value === 0 ? "bg-slate-200" : hovered === i ? "bg-brand-700" : accent}`}
                style={{ height: r.value === 0 ? 2 : `${(r.value / niceMax) * 100}%` }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                title={`${r.label}: ${fmt(r.value)}${unit ? ` ${unit}` : ""}`}
              />
            ))}
          </div>
          {showAvg && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                points={avgPts.map((a, i) => `${(((i + 0.5) / rows.length) * 100).toFixed(2)},${(100 - (a / niceMax) * 100).toFixed(2)}`).join(" ")}
                fill="none"
                stroke="#0e1c2b"
                strokeOpacity={0.45}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>
      </div>
      <div className="flex h-4 gap-[2px] pl-10 pt-0.5">
        {rows.map((r, i) => {
          const show = i === 0 || i === last || (i % labelEvery === 0 && last - i >= labelEvery);
          return (
            <div key={r.label} className="relative min-w-[3px] flex-1">
              {show && (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted">{dayLabel(r.label)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// `share` (default on) prints each row's %-of-total — turn it OFF for rows
// that overlap (e.g. cumulative scroll-depth buckets), where a share is a lie.
function HBars({ title, rows, tip, share = true }: { title: string; rows: Count[]; tip?: string; share?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
            return (
              <div key={r.label} className="flex items-center gap-2 text-sm">
                <div className="w-36 shrink-0 break-words line-clamp-2 text-muted" title={r.label}>{r.label}</div>
                <div className="h-4 flex-1 rounded bg-slate-100">
                  <div className="h-4 rounded bg-brand-600" style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
                <div className={`${share ? "w-16" : "w-8"} shrink-0 whitespace-nowrap text-right tabular-nums`}>
                  <span className="font-semibold text-navy">{r.count}</span>
                  {share && <span className="text-[10px] text-muted"> · {pct}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Funnel({ rows, tip, title = "Funnel — how many reach each step" }: { rows: Count[]; tip?: string; title?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const top = rows[0]?.count ?? 0;
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].count : 0;
          const pct = i > 0 && prev > 0 ? Math.round((r.count / prev) * 100) : null;
          const ofTop = top > 0 ? Math.round((r.count / top) * 100) : null;
          const width = (r.count / max) * 100;
          const narrow = width < 15; // fill too short for the white inside-count
          return (
            <div key={r.label} className="flex items-center gap-2 text-sm">
              <div className="w-24 shrink-0 text-muted">{r.label}</div>
              <div className="relative h-5 flex-1 rounded bg-slate-100">
                <div className={`flex h-5 items-center rounded bg-brand-600 ${narrow ? "" : "px-2 text-xs font-semibold text-white"}`} style={{ width: `${width}%` }}>
                  {!narrow && r.count}
                </div>
                {narrow && (
                  <span className="absolute top-0 flex h-5 items-center pl-1.5 text-xs font-semibold text-navy" style={{ left: `${width}%` }}>
                    {r.count}
                  </span>
                )}
              </div>
              <div className="w-20 shrink-0 text-right text-xs text-muted">
                <div>{i === 0 ? "100%" : pct != null ? `${pct}%` : ""}</div>
                {i > 0 && ofTop != null && <div className="text-[10px] text-muted">{ofTop}% of first step</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VBars({ title, rows, tip, unit = "" }: { title: string; rows: { date: string; leads: number }[]; tip?: string; unit?: string }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No leads in range.</p>
      ) : (
        <DayBarChart rows={rows.map((r) => ({ label: r.date, value: r.leads }))} height={112} unit={unit} />
      )}
    </div>
  );
}

/** Compact per-day mini bar chart — data-health strip. Generic value key. */
function MiniBars({ title, rows, tip }: { title: string; rows: { day: string; value: number }[]; tip?: string }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data.</p>
      ) : (
        <DayBarChart rows={rows.map((r) => ({ label: r.day, value: r.value }))} height={80} />
      )}
    </div>
  );
}

// 0 -> "12a", 13 -> "1p" — compact hour-of-day labels for the heatmap axis.
function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function Heatmap({
  grid,
  tip,
  title = "When leads arrive (day × hour, Mountain time)",
  unit = "lead",
}: {
  grid: number[][];
  tip?: string;
  title?: string;
  unit?: string;
}) {
  const [hovered, setHovered] = useState<{ d: number; h: number; c: number } | null>(null);
  const max = Math.max(1, ...grid.flat());
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="card overflow-x-auto p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
        {hovered && (
          <span className="text-xs tabular-nums text-muted">
            <span className="font-semibold text-navy">{days[hovered.d]} {hourLabel(hovered.h)}</span> — {hovered.c} {unit}{hovered.c === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="min-w-[560px] space-y-0.5">
        {grid.map((row, d) => (
          <div key={d} className="flex items-center gap-0.5">
            <div className="w-8 shrink-0 text-[11px] text-muted">{days[d]}</div>
            {row.map((c, h) => (
              <div
                key={h}
                className="h-4 flex-1 rounded-sm"
                style={{ backgroundColor: c ? `rgba(37,99,235,${0.18 + 0.82 * (c / max)})` : "#f1f5f9" }}
                title={`${days[d]} ${h}:00 — ${c} ${unit}${c === 1 ? "" : "s"}`}
                onMouseEnter={() => setHovered({ d, h, c })}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </div>
        ))}
        <div className="flex gap-0.5 pl-8 pt-1">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[10px] text-muted">{h % 3 === 0 ? hourLabel(h) : ""}</div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 pl-8 pt-1.5 text-[10px] text-muted">
          <span>0</span>
          <span className="h-3 w-4 rounded-sm" style={{ backgroundColor: "#f1f5f9" }} />
          {[0.18, 0.45, 0.72, 1].map((a) => (
            <span key={a} className="h-3 w-4 rounded-sm" style={{ backgroundColor: `rgba(37,99,235,${a})` }} />
          ))}
          <span>= {max} {unit}{max === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

/** Stroke-icon wrapper for the left nav (feather-style paths). */
function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Display-only prettifier for raw enum-ish values ("offer_sent" → "Offer sent").
 * Matching still uses the raw value — this never changes what gets filtered. */
function prettyValue(s: string): string {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** One filter as a row of pill buttons (same style as the Ads tab) — "All" plus
 * every value. Click to select; click the active pill again to clear. */
function PillRow({
  label,
  value,
  onChange,
  opts,
  pretty,
}: {
  label: string;
  value?: string;
  onChange: (v?: string) => void;
  opts: string[];
  pretty?: boolean;
}) {
  if (opts.length === 0) return null;
  const pill = (active: boolean) =>
    `rounded-lg px-3 py-1 text-sm font-semibold transition ${active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <button type="button" className={pill(!value)} onClick={() => onChange(undefined)}>
        All
      </button>
      {opts.map((o) => (
        <button key={o} type="button" className={pill(value === o)} onClick={() => onChange(value === o ? undefined : o)}>
          {pretty ? prettyValue(o) : o}
        </button>
      ))}
    </div>
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
        <h3 className="text-sm font-bold text-navy">How each group of leads performs{tip && <InfoDot tip={tip} />}</h3>
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
            <th className="pl-2 text-right">Typical response time</th>
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
                <td className="px-2 text-right">{r.margin ? <>{money(r.margin)}{r.marginIsEstimate && <EstBadge />}</> : "—"}</td>
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
          <div>{p.touchCount} interaction{p.touchCount === 1 ? "" : "s"}</div>
          {p.purchasePrice ? <div className="font-semibold text-emerald-700">{money(p.purchasePrice)}</div> : null}
        </div>
      </button>

      {open && (
        <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 md:grid-cols-2">
          <div className="space-y-1.5 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Where they came from</div>
            <Row k="Source" v={p.source} />
            {a?.utmCampaign && <Row k="Campaign" v={a.utmCampaign} />}
            {a?.utmMedium && <Row k="Traffic type" v={a.utmMedium} />}
            {a?.utmContent && <Row k="Which ad / ad set" v={a.utmContent} />}
            {a?.utmTerm && <Row k="Search keyword" v={a.utmTerm} />}
            {a?.matchType && <Row k="Keyword match (Google Ads)" v={a.matchType} />}
            {a?.placement && <Row k="Where it showed" v={a.placement} />}
            {a?.referrer && <Row k="Previous website" v={a.referrer} />}
            {a?.landingPath && <Row k="Landed on" v={a.landingPath} />}
            {loc && <Row k="Location" v={loc} />}
            {p.geo?.postal && <Row k="Postal" v={p.geo.postal} />}
            {(p.geo?.isp || p.geo?.org) && (
              <Row k="Internet provider" v={[...new Set([p.geo.isp, p.geo.org].filter(Boolean) as string[])].join(" · ")} />
            )}
            {p.geo?.timezone && <Row k="Timezone" v={p.geo.timezone} />}
            {p.geo?.latitude != null && p.geo?.longitude != null && (
              <Row k="Coordinates" v={`${p.geo.latitude.toFixed(3)}, ${p.geo.longitude.toFixed(3)} (approx)`} />
            )}
            {p.device?.type && <Row k="Device" v={[p.device.type, p.device.os, p.device.browser].filter(Boolean).join(" · ")} />}
            {p.touchHistory && p.touchHistory.length > 0 && (
              <>
                <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">
                  How they got here, step by step<InfoDot tip={SRC.journey} />
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
            <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">What they did on the site</div>
            <Row k="Time on site" v={fmtDur(p.behavior?.timeOnSiteMs)} />
            <Row k="Pages viewed" v={String(p.behavior?.pageviews ?? "—")} />
            <Row k="Form step reached" v={p.behavior?.maxFunnelStep ? `Step ${p.behavior.maxFunnelStep}` : "—"} />
            {p.behavior?.maxScrollPct != null && <Row k="How far they scrolled" v={`${p.behavior.maxScrollPct}%`} />}
            {p.behavior?.viewport && <Row k="Screen" v={p.behavior.viewport} />}
            {(p.behavior?.tabSwitches ?? 0) > 0 && <Row k="Tab switches" v={String(p.behavior?.tabSwitches ?? 0)} />}
            {p.behavior?.contactInput && p.behavior.contactInput !== "typed" && (
              <Row k="How contact info was entered" v={p.behavior.contactInput} />
            )}
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
                  Worked out from their info<InfoDot tip={SRC.enrich} />
                </div>
                {p.enrichment.emailType && <Row k="Email type" v={p.enrichment.emailType} />}
                {p.enrichment.phoneRegion && <Row k="Phone region" v={p.enrichment.phoneRegion} />}
                {p.enrichment.vehicleTier && (
                  <Row
                    k="Vehicle tier"
                    v={`${p.enrichment.vehicleTier}${p.enrichment.vehicleAge !== undefined ? ` (${p.enrichment.vehicleAge} yrs old)` : ""}`}
                  />
                )}
                {p.enrichment.regionMismatch && (
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted">Location check</span>
                    <span
                      className="min-w-0 text-amber-700"
                      title="The IP location and the phone's area code point to different provinces (or the IP is outside Canada while the phone is Canadian). Could be travel, a VPN, a recent move, or a lower-quality lead — a soft signal, not a reject."
                    >
                      ⚠ Internet location and phone area code do not match
                    </span>
                  </div>
                )}
                {p.enrichment.foreignNumber && (
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted">Foreign connection</span>
                    <span
                      className="min-w-0 text-amber-700"
                      title="Suggests the form may have been filled out from overseas, based on where their internet connection is — not an automatic reject."
                    >
                      ⚠ Their internet connection is from a country outside the +1 calling area (Canada/US)
                    </span>
                  </div>
                )}
                {p.enrichment.tzMismatch && (
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted">Timezone check</span>
                    <span
                      className="min-w-0 text-amber-700"
                      title="Could be travel, a VPN, or an out-of-province lead — a soft signal, not a reject."
                    >
                      ⚠ Their internet connection points to a time zone outside Canada
                    </span>
                  </div>
                )}
                {(p.enrichment.sameNetworkLeads ?? 0) >= 2 && (
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted">Shared network</span>
                    <span
                      className="min-w-0 text-amber-700"
                      title="2+ leads from one unusual network suggests a single actor spamming the form — a soft signal, not a reject."
                    >
                      ⚠ {p.enrichment.sameNetworkLeads} other lead{p.enrichment.sameNetworkLeads === 1 ? "" : "s"} came from this same network
                    </span>
                  </div>
                )}
                {p.enrichment.conditionFlags && p.enrichment.conditionFlags.length > 0 && (
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted">Condition warnings</span>
                    <span className="min-w-0 text-amber-700" title="Parsed from the seller's condition chips + note — worth a look before driving out.">
                      {p.enrichment.conditionFlags.join(", ")}
                    </span>
                  </div>
                )}
                {p.enrichment.mileageVsMarket && <Row k="Mileage" v={`${p.enrichment.mileageVsMarket} for its age`} />}
                {p.enrichment.referrerQuality && <Row k="Traffic type (best guess)" v={p.enrichment.referrerQuality} />}
              </>
            )}
            {(p.bestTime || (p.returnVisits ?? 0) > 1 || p.timeToConvMs != null || p.referrerIsSeller || p.selfReferral) && (
              <>
                <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">Other clues</div>
                {p.bestTime && <Row k="Best time to reach them" v={p.bestTime} />}
                {(p.returnVisits ?? 0) > 1 && <Row k="Return visits" v={`${p.returnVisits} visits`} />}
                {p.timeToConvMs != null && <Row k="Time from first visit to lead" v={fmtDur(p.timeToConvMs)} />}
                {p.referrerIsSeller && <Row k="Referred by" v="Also a seller (repeat)" />}
                {p.selfReferral && (
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted">Referral</span>
                    <span
                      className="min-w-0 text-amber-700"
                      title="The referrer and the friend share the same email or phone — likely a self-referral to game the reward."
                    >
                      ⚠ Self-referral
                    </span>
                  </div>
                )}
              </>
            )}
            {(p.emailEngagement || p.smsEngagement) && (
              <>
                <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Email & text activity<InfoDot tip={SRC.comms} />
                </div>
                {p.emailEngagement && (
                  <Row
                    k="Emails"
                    v={`${p.emailEngagement.deliveredCount ?? 0} delivered · ${p.emailEngagement.opensCount ?? 0} opened · ${p.emailEngagement.clicksCount ?? 0} clicked`}
                  />
                )}
                {p.emailEngagement?.lastClickedUrl && <Row k="Last link clicked" v={p.emailEngagement.lastClickedUrl} />}
                {p.emailOpenLatencyMins != null && <Row k="Opened after" v={fmtMins(p.emailOpenLatencyMins)} />}
                {p.emailEngagement?.lastBounceReason && (
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted">Why the email failed</span>
                    <span className="min-w-0 truncate text-red-600" title={p.emailEngagement.lastBounceReason}>{p.emailEngagement.lastBounceReason}</span>
                  </div>
                )}
                {p.emailEngagement?.lastDelayedAt && (
                  <div className="flex gap-2">
                    <span className="w-28 shrink-0 text-muted">Delivery delayed</span>
                    <span className="min-w-0 text-amber-700" title="Their mail provider was slow to accept the email — it is stuck retrying, not failed.">
                      {timeAgo(p.emailEngagement.lastDelayedAt)}
                    </span>
                  </div>
                )}
                {p.smsEngagement && (
                  <Row
                    k="Texts"
                    v={`${p.smsEngagement.deliveredCount ?? 0} delivered · ${p.smsEngagement.failedCount ?? 0} failed`}
                  />
                )}
              </>
            )}
            {p.negotiation && p.negotiation.length > 0 && (
              <>
                <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Negotiation<InfoDot tip="What they asked for vs. what you offered, logged from Telegram over time. Gap = their latest ask minus your latest offer." />
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-1">
                  {p.negotiation.map((e, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-300">→</span>}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.kind === "ask" ? "bg-amber-100 text-amber-800" : e.kind === "offer" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800"}`}
                        title={new Date(e.at).toLocaleString("en-CA")}
                      >
                        {e.kind} {money(e.amount)}
                      </span>
                    </span>
                  ))}
                </div>
                {(() => {
                  const lastAsk = [...p.negotiation].reverse().find((e) => e.kind === "ask");
                  const lastOffer = [...p.negotiation].reverse().find((e) => e.kind === "offer");
                  if (!lastAsk || !lastOffer) return null;
                  const gap = lastAsk.amount - lastOffer.amount;
                  return <Row k="Ask vs offer" v={gap > 0 ? `${money(gap)} apart (${money(lastAsk.amount)} vs ${money(lastOffer.amount)})` : "met their ask"} />;
                })()}
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
  const [showFilters, setShowFilters] = useState(true);
  const presets: { key: Preset; label: string }[] = [
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
    { key: "all", label: "All" },
  ];
  return (
    <>
      <div className="sticky top-20 z-40 mb-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
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
            {showFilters ? "Hide filters" : `Filters${activeFilters > 0 ? ` (${activeFilters})` : ""}`}
          </button>
          <span className="ml-auto self-center text-sm text-muted">{countLabel}</span>
        </div>
      </div>
      {showFilters && (
        <div className="mb-6 space-y-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <PillRow label="Province" value={filters.region} onChange={(v) => set({ region: v })} opts={options.regions} />
          <PillRow label="Source" value={filters.source} onChange={(v) => set({ source: v })} opts={options.sources} pretty />
          <PillRow label="Stage" value={filters.stage} onChange={(v) => set({ stage: v })} opts={options.stages} pretty />
          <PillRow label="Lead score" value={filters.scoreBand} onChange={(v) => set({ scoreBand: v })} opts={options.scoreBands} pretty />
          <PillRow label="Ad set" value={filters.adset} onChange={(v) => set({ adset: v })} opts={options.adsets} />
          <PillRow label="Device" value={filters.device} onChange={(v) => set({ device: v })} opts={options.devices} pretty />
          <PillRow label="Country" value={filters.country} onChange={(v) => set({ country: v })} opts={options.countries} />
          {activeFilters > 0 && (
            <div className="border-t border-slate-100 pt-2.5">
              <button type="button" onClick={clearFilters} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-navy hover:bg-slate-200">
                Clear all filters ({activeFilters})
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
//  Funnel economics — the Overview hero. One row per Meta campaign (level=ad
//  rows grouped by campaignId), plus an untagged/organic row for profiles that
//  match no campaign. Joins DB leads to campaigns by any-touch utm_campaign.
// ---------------------------------------------------------------------------

/** Does a profile carry this campaign name on any touch (or first-touch attr)? A
 * manual "assign to campaign" override counts too — it's your correction, so it
 * only affects this (corrected / "my data") view, never the tracked record. */
function profileMatchesCampaign(p: Profile, campaign: string): boolean {
  if (!campaign) return false;
  if (p.assignedCampaign === campaign) return true;
  if (p.attribution?.utmCampaign === campaign) return true;
  return (p.touchHistory || []).some((t) => t.utmCampaign === campaign);
}

/** Any campaign at all (used to bucket the organic remainder). */
function profileHasAnyCampaign(p: Profile, campaigns: Set<string>): boolean {
  if (p.assignedCampaign && campaigns.has(p.assignedCampaign)) return true;
  if (p.attribution?.utmCampaign && campaigns.has(p.attribution.utmCampaign)) return true;
  return (p.touchHistory || []).some((t) => t.utmCampaign && campaigns.has(t.utmCampaign));
}

function FunnelEconomics({
  profiles,
  ads,
  configured,
  loading,
  dateBounds,
}: {
  profiles: Profile[];
  ads: AdInsightAd[];
  configured: boolean;
  loading?: boolean;
  dateBounds: { dateFrom?: string; dateTo?: string };
}) {
  const [assignTo, setAssignTo] = useState("");
  const [assigning, setAssigning] = useState(false);
  const allCampaignNames = useMemo(() => new Set(ads.map((a) => a.campaign).filter(Boolean)), [ads]);
  const organicProfiles = useMemo(
    // Only profiles that actually OWN a lead can carry the correction (assignedCampaign
    // lives on the Lead), so count + assign the exact same set — never promise to move
    // a chat/referral-only person we can't tag.
    () => profiles.filter((p) => p.leadIds.length > 0 && !profileHasAnyCampaign(p, allCampaignNames)),
    [profiles, allCampaignNames],
  );
  async function bulkAssign() {
    if (!assignTo || !organicProfiles.length || assigning) return;
    if (
      !confirm(
        `Assign all ${organicProfiles.length} untagged ${organicProfiles.length === 1 ? "person" : "people"} to "${assignTo}"?\n\nThis is YOUR correction — it won't change what Meta actually tracked.`,
      )
    )
      return;
    setAssigning(true);
    const leadIds = organicProfiles.flatMap((p) => p.leadIds);
    await fetch("/api/admin/assign-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds, campaign: assignTo }),
    }).catch(() => {});
    window.location.reload();
  }
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
      const marginIsEstimate = closedP.some((p) => p.marginIsEstimate);
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
        marginIsEstimate,
        mroas: spend ? margin / spend : null,
      };
    };

    const out = [...byCampaign.values()]
      .sort((a, b) => b.spend - a.spend)
      .map((c) => build(c.campaign, c.spend, c.impressions, c.linkClicks, profiles.filter((p) => profileMatchesCampaign(p, c.campaign))));

    // Organic / untagged remainder — profiles matching no known campaign.
    const organic = profiles.filter((p) => !profileHasAnyCampaign(p, campaignNames));
    out.push(build("(untagged — no ad campaign matched)", 0, 0, 0, organic));
    return out;
  }, [profiles, ads, dateBounds]);

  return (
    <div className="card overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">
          From ad spend to margin — per campaign
          <InfoDot tip="Spend, times shown and link clicks come from Meta, grouped by campaign. Leads, qualified, booked, closed & margin come from YOUR database, matched to the campaign by the tracking tag on the ad link (utm_campaign={{campaign.name}}). Untagged = leads matching no Meta campaign." />
        </h3>
      </div>
      {loading ? (
        <p className="mb-3 text-xs text-muted">Loading Meta spend…</p>
      ) : !configured ? (
        <p className="mb-3 text-xs text-muted">
          <span className="font-semibold text-navy">Meta not connected</span> — spend columns show zero. Your own numbers (leads, qualified, booked, closed, margin) still fill in.
        </p>
      ) : null}
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-2" title="Meta campaign name.">Campaign</th>
            <th className="px-2 text-right" title="Meta Ads API — amount spent.">Spend</th>
            <th className="px-2 text-right" title="Meta Ads API — times shown.">Times shown</th>
            <th className="px-2 text-right" title="Meta Ads API — inline link clicks.">Link clicks</th>
            <th className="px-2 text-right" title="Your database — people who created a real lead in range, matched to this campaign by the tracking tag on the ad link.">Leads</th>
            <th className="px-2 text-right" title="Spend ÷ leads in your database.">Cost/lead</th>
            <th className="px-2 text-right" title="Your database — matched leads with a lead score of 70 or higher.">Qualified</th>
            <th className="px-2 text-right" title="Spend ÷ qualified leads.">Cost/qualified</th>
            <th className="px-2 text-right" title="Your database — matched leads that reached booked/closed.">Booked</th>
            <th className="px-2 text-right" title="Spend ÷ booked.">Cost/booked</th>
            <th className="px-2 text-right" title="Your database — matched closed deals.">Closed</th>
            <th className="px-2 text-right" title="Margin from matched deals closed in range = sale price (actual, or expected) minus cost.">Margin</th>
            <th className="pl-2 text-right" title="Margin ÷ spend.">Margin per $1 of ads</th>
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
                <td className="px-2 text-right">{r.margin ? <>{money(r.margin)}{r.marginIsEstimate && <EstBadge />}</> : "—"}</td>
                <td className="pl-2 text-right">{r.mroas != null ? <>{r.mroas.toFixed(1)}×{Boolean(r.margin) && r.marginIsEstimate && <EstBadge />}</> : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Spend, times shown and link clicks come from Meta. Leads, qualified (score ≥ 70), booked, closed &amp; margin come from your own database, matched to the campaign by the tracking tag on the ad link — ads must carry <code className="rounded bg-slate-100 px-1">utm_campaign={"{{campaign.name}}"}</code> for the match to work. Untagged collects leads that match no Meta campaign.
      </p>
      {allCampaignNames.size > 0 && organicProfiles.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs">
          <span className="font-semibold text-navy">Clean up untagged:</span>
          <span className="text-muted">
            move the {organicProfiles.length} untagged {organicProfiles.length === 1 ? "person" : "people"} to
          </span>
          <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
            <option value="">choose a campaign…</option>
            {[...allCampaignNames].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={bulkAssign}
            disabled={!assignTo || assigning}
            className="rounded bg-navy px-3 py-1 font-semibold text-white disabled:opacity-40"
          >
            {assigning ? "Assigning…" : "Assign"}
          </button>
          <span className="text-muted">Saved as your correction — never touches what Meta tracked.</span>
        </div>
      )}
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
        // NOTE: this is the Meta-tracked view (matches Ads Manager) — it deliberately
        // does NOT honor assignedCampaign, so manual corrections never leak in here.
        (p) => p.attribution?.utmCampaign === ins.campaign || (p.touchHistory || []).some((t) => t.utmCampaign === ins.campaign),
      );
      const closed = ps.filter((p) => p.stage === "closed" && p.closedAt && Date.parse(p.closedAt) >= cutoff);
      const margin = closed.reduce((s, p) => s + (p.margin || 0), 0);
      const marginIsEstimate = closed.some((p) => p.marginIsEstimate);
      const leads = ins.leads ?? 0;
      const cpl = ins.costPerLead ?? (leads ? ins.spend / leads : null);
      return { ...ins, leads, margin, marginIsEstimate, cpl, roas: ins.spend ? margin / ins.spend : null };
    });
  }, [insights, profiles, days]);

  return (
    <div className="card overflow-x-auto p-4">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-2" title="Campaign name from Meta.">Campaign</th>
            <th className="px-2 text-right" title="Meta Ads API — amount spent.">Spend</th>
            <th className="px-2 text-right" title="Meta Ads API — times your ad was shown.">Times shown</th>
            <th className="px-2 text-right" title="Meta Ads API — link clicks.">Link clicks</th>
            <th className="px-2 text-right" title="Meta Ads API — of the times the ad was shown, the % that clicked the link.">Link click rate</th>
            <th className="px-2 text-right" title="Meta's own count of leads it credits to this ad.">Leads</th>
            <th className="px-2 text-right" title="Meta ad spend ÷ Meta Pixel leads.">Cost/lead</th>
            <th className="px-2 text-right" title="Margin from deals CLOSED in the selected window, matched to this campaign by the tracking tag on any of their visits (ads must carry utm_campaign={campaign.name}).">Margin</th>
            <th className="pl-2 text-right" title="Margin ÷ spend.">Margin per $1 of ads</th>
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
                <td className="px-2 text-right">{r.margin ? <>{money(r.margin)}{r.marginIsEstimate && <EstBadge />}</> : "—"}</td>
                <td className="pl-2 text-right">{r.roas != null ? <>{r.roas.toFixed(1)}×{Boolean(r.margin) && r.marginIsEstimate && <EstBadge />}</> : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Spend, leads &amp; cost-per-lead come straight from Meta (matches Ads Manager). Margin from deals closed in the selected window, matched to this campaign by the tracking tag on any of their visits (ads must carry utm_campaign={"{campaign.name}"}). An <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold uppercase text-amber-700">est</span> tag means the figure includes a car you&apos;ve bought but not sold yet — it uses your expected resale until you record the actual sold price.</p>
    </div>
  );
}

// Meta's per-ad diagnostic rankings, relative to other advertisers competing
// for the same audience — green/slate/red pills, hidden when Meta hasn't
// scored the ad yet ("unknown" or absent).
const RANKING_STYLE: Record<string, string> = {
  above_average: "bg-emerald-100 text-emerald-700",
  average: "bg-slate-100 text-slate-600",
  below_average: "bg-red-100 text-red-700",
};
function RankingPill({ label, value }: { label: string; value?: string }) {
  if (!value || value === "unknown") return null;
  const style = RANKING_STYLE[value.toLowerCase()] || "bg-red-100 text-red-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`} title={`${label} ranking: ${value.replace(/_/g, " ")}`}>
      {label}
    </span>
  );
}

/** Creative-level table from level=ad rows: link CTR + hook/hold + Meta leads. */
function CreativeTable({ ads }: { ads: AdInsightAdRanked[] }) {
  const rows = useMemo(() => [...ads].sort((a, b) => b.spend - a.spend), [ads]);
  return (
    <div className="card overflow-x-auto p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">
        How each ad is doing
        <InfoDot tip="From Meta, one row per ad. Watched 3s+ = share of times shown where the video played at least 3 seconds; Kept watching = share of 3-second viewers who watched to the end (or 15 seconds). Image ads have no video numbers — shown as —." />
      </h3>
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-2" title="Ad (creative) name.">Ad</th>
            <th className="px-2" title="Ad set name.">Ad set</th>
            <th className="px-2 text-right" title="Meta Ads API — amount spent.">Spend</th>
            <th className="px-2 text-right" title="Meta Ads API — times shown.">Times shown</th>
            <th className="px-2 text-right" title="Meta Ads API — average times each person has seen this ad. At 4+, people are often getting tired of it — usually time for a fresh ad.">Times seen per person</th>
            <th className="px-2 text-right" title="Meta Ads API — of the times the ad was shown, the % that clicked the link.">Link click rate</th>
            <th className="px-2 text-right" title="Of all the times the ad was shown, the % where the video played at least 3 seconds.">Watched 3s+</th>
            <th className="px-2 text-right" title="Of viewers who watched 3 seconds, the % who kept watching to the end (or at least 15 seconds).">Kept watching</th>
            <th className="px-2 text-right" title="Meta's own count of leads it credits to this ad.">Leads</th>
            <th className="px-2 text-right" title="Meta spend ÷ Meta leads.">Cost/lead</th>
            <th className="pl-2" title="Meta's grades for this ad compared with other advertisers trying to reach the same people.">Rankings</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={11} className="py-3 text-muted">No ads in range.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.adId || r.ad} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-semibold text-navy" title={r.ad}>{r.ad}</td>
                <td className="px-2 text-muted" title={r.adset}>{r.adset}</td>
                <td className="px-2 text-right">{money(r.spend)}</td>
                <td className="px-2 text-right">{r.impressions.toLocaleString("en-CA")}</td>
                <td className="px-2 text-right">
                  {r.frequency != null ? (
                    <span className={r.frequency >= 4 ? "font-semibold text-amber-700" : ""}>{r.frequency.toFixed(1)}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 text-right">{r.linkCtr != null ? `${r.linkCtr.toFixed(1)}%` : "—"}</td>
                <td className="px-2 text-right">{r.hookRate != null ? `${r.hookRate.toFixed(1)}%` : "—"}</td>
                <td className="px-2 text-right">{r.holdRate != null ? `${r.holdRate.toFixed(1)}%` : "—"}</td>
                <td className="px-2 text-right">{r.leads ?? "—"}</td>
                <td className="px-2 text-right font-semibold">{money2(r.costPerLead ?? (r.leads ? r.spend / r.leads : null))}</td>
                <td className="pl-2">
                  <div className="flex flex-wrap gap-1">
                    <RankingPill label="Quality" value={r.qualityRanking} />
                    <RankingPill label="Interactions" value={r.engagementRateRanking} />
                    <RankingPill label="Results" value={r.conversionRateRanking} />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Compact spend/leads/cost-per-lead breakdown — shared by the region and
 * placement views below the creative table. */
function BreakdownTable({
  title,
  tip,
  rows,
  leadsTip,
}: {
  title: string;
  tip?: string;
  rows: { label: string; spend: number; leads?: number }[];
  leadsTip?: string;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.spend - a.spend), [rows]);
  return (
    <div className="card overflow-x-auto p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}{tip && <InfoDot tip={tip} />}</h3>
      <table className="w-full min-w-[320px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-2"></th>
            <th className="px-2 text-right" title="Meta Ads API — amount spent.">Spend</th>
            <th className="px-2 text-right" title={leadsTip || "Meta's own count of leads credited here."}>Leads</th>
            <th className="pl-2 text-right" title="Spend ÷ leads.">Cost/lead</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr><td colSpan={4} className="py-3 text-muted">No data.</td></tr>
          ) : (
            sorted.map((r) => (
              <tr key={r.label} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-semibold text-navy">{r.label}</td>
                <td className="px-2 text-right">{money(r.spend)}</td>
                <td className="px-2 text-right">{r.leads ?? "—"}</td>
                <td className="pl-2 text-right font-semibold">{money2(r.leads ? r.spend / r.leads : null)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CampaignVehicleCard({ profiles }: { profiles: Profile[] }) {
  const rows = useMemo(() => campaignVehicle(profiles), [profiles]);
  return (
    <div className="card overflow-x-auto p-4">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No leads in range.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-2">Campaign / source</th>
              <th className="px-2 text-right">Leads</th>
              <th className="px-2">Top make</th>
              <th className="pl-2 text-right" title="Of this source's leads, the share whose car falls in the high-value group — high means it sends buyable cars, not just clicks.">High-value %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.campaign} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-semibold text-navy" title={r.campaign}>{r.campaign}</td>
                <td className="px-2 text-right">{r.leads}</td>
                <td className="px-2 capitalize">{r.topMake}</td>
                <td className="pl-2 text-right font-semibold">{r.highValuePct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function WarmAbandonersCard({ profiles }: { profiles: Profile[] }) {
  const rows = useMemo(() => warmAbandoners(profiles), [profiles]);
  return (
    <div className="card overflow-x-auto p-4">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No abandoned leads with a phone number in range.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-2">Who</th>
              <th className="px-2">Phone</th>
              <th className="px-2">Vehicle</th>
              <th className="px-2">Source</th>
              <th className="pl-2 text-right">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-2 pr-2 font-semibold text-navy">{r.name || "(no name)"}</td>
                <td className="px-2"><a href={`tel:${r.phone}`} className="font-semibold text-brand-600 hover:underline">{r.phone}</a></td>
                <td className="px-2 text-muted">{r.vehicle || "—"}</td>
                <td className="px-2 text-muted">{r.source}</td>
                <td className="pl-2 text-right text-muted">{timeAgo(r.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
        business.facebook.com → Audiences → Create → Customer list — Ads Manager scrambles every field in your browser
        before anything reaches Meta. Heads-up: audiences under ~100 matched people won&apos;t deliver ads, and
        Lookalike audiences need at least 100 people to start from — set them up now so they fill as you grow. Full walkthrough:{" "}
        <code className="rounded bg-slate-100 px-1">docs/meta-audiences.md</code>.
      </p>
    </div>
  );
}

// GA4's dayOfWeek×hour rows -> the same 7×24 grid shape Heatmap expects.
function ga4HeatGrid(rows: { dow: number; hour: number; sessions: number }[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows) {
    if (r.dow >= 0 && r.dow < 7 && r.hour >= 0 && r.hour < 24) grid[r.dow][r.hour] = r.sessions;
  }
  return grid;
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
        <p className="text-xs text-amber-700">Showing the closest range Google Analytics offers ({days} days) — Google Analytics only offers 7, 30, or 90-day views here.</p>
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
        <StatCard label="Visits" value={n(t.totals.sessions)} tip={SRC.ga4} />
        <StatCard label="Pages viewed" value={n(t.totals.pageviews)} tip={SRC.ga4} />
        <StatCard label="Stuck around" value={`${Math.round(t.totals.engagementRate * 100)}%`} tip="Google Analytics — share of visits where the person actually stuck around (stayed 10+ seconds, viewed more pages, or took an action)." />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <VBars title="Visitors over time" rows={t.overTime.map((o) => ({ date: o.date, leads: o.users }))} tip={SRC.ga4} />
        <HBars title={country ? `Where visits come from (${country})` : "Where visits come from"} rows={t.bySource.map((s) => ({ label: s.label, count: s.sessions }))} tip={SRC.ga4} />
        <HBars title={country ? `Where visitors come from (${country})` : "Where visitors come from"} rows={t.bySource.map((s) => ({ label: s.label, count: s.users }))} tip={SRC.ga4} />
        <HBars title="By country" rows={full.byCountry.map((c) => ({ label: c.label, count: c.users }))} tip={SRC.ga4} />
        <HBars title={country ? `By device (${country})` : "By device"} rows={t.byDevice.map((d) => ({ label: d.label, count: d.users }))} tip={SRC.ga4} />
        {t.byChannel && t.byChannel.length > 0 && (
          <HBars title="By traffic type" rows={t.byChannel.map((c) => ({ label: c.label, count: c.users }))} tip="Google Analytics 4 — default channel grouping (Organic Search, Paid Social, Direct, Referral…)." />
        )}
        {t.byNewReturning && t.byNewReturning.length > 0 && (
          <HBars title="New vs returning" rows={t.byNewReturning.map((c) => ({ label: c.label, count: c.users }))} tip="Google Analytics 4 — first-time vs returning visitors." />
        )}
        {t.byCity && t.byCity.length > 0 && (
          <HBars title={country ? `By city (${country})` : "By city"} rows={t.byCity.map((c) => ({ label: c.label, count: c.users }))} tip="Google Analytics 4 — visitors by city (estimated from the visitor's internet connection; Google hides cities with very few visitors)." />
        )}
        {t.byLanding && t.byLanding.length > 0 && (
          <HBars title="First pages people land on" rows={t.byLanding.map((c) => ({ label: c.label, count: c.users }))} tip="Google Analytics 4 — the pages visitors entered the site on." />
        )}
        {t.leadsBySource && (
          t.leadsBySource.some((s) => s.keyEvents > 0) ? (
            <HBars
              title="Leads by source (Google's count)"
              rows={t.leadsBySource.map((s) => ({ label: s.label, count: s.keyEvents }))}
              tip="Google Analytics' own count of leads, split by where each visit came from."
            />
          ) : (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-bold text-navy">Leads by source (Google's count)</h3>
              <p className="text-sm text-muted">No key events yet — mark generate_lead as a Key event in GA4 Admin → Events.</p>
            </div>
          )
        )}
      </div>
      {t.visitHeat && t.visitHeat.length > 0 && (
        <Heatmap
          grid={ga4HeatGrid(t.visitHeat)}
          title="When visitors browse (day × hour, in your Google Analytics timezone)"
          unit="session"
          tip="Google Analytics — number of visits by day of the week and hour of the day, in the timezone your Analytics account uses."
        />
      )}
    </div>
  );
}

// Canada vs foreign split of the filtered people — foreign leads usually can't
// sell you a car (often you, or organic browsers), and the foreign count is the
// signal to watch as a US expansion approaches.
function GeoSplit({ profiles }: { profiles: Profile[] }) {
  const hasGeo = (p: Profile) => Boolean(p.geo?.countryCode || p.geo?.country);
  const isCA = (p: Profile) => p.geo?.countryCode === "CA" || p.geo?.country === "Canada";
  const canadian = profiles.filter((p) => hasGeo(p) && isCA(p)).length;
  const foreign = profiles.filter((p) => hasGeo(p) && !isCA(p)).length;
  const unknown = profiles.length - canadian - foreign;
  const located = canadian + foreign;
  const caPct = located ? Math.round((canadian / located) * 100) : null;
  const n = (x: number) => x.toLocaleString("en-CA");
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        Canada vs foreign
        <InfoDot tip="Where each person appears to be, based on their internet address. Foreign visitors usually can't sell you a car (often it's you, or people just browsing) — worth watching as you plan a US expansion. Unknown = no location yet (unfinished forms, or new leads the hourly location check hasn't reached)." />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-4">
        <div>
          <div className="font-display text-2xl font-extrabold text-green-700">{n(canadian)}</div>
          <div className="text-xs text-muted">🇨🇦 Canada</div>
        </div>
        <div>
          <div className="font-display text-2xl font-extrabold text-navy">{n(foreign)}</div>
          <div className="text-xs text-muted">🌎 Foreign</div>
        </div>
        <div>
          <div className="font-display text-2xl font-extrabold text-slate-400">{n(unknown)}</div>
          <div className="text-xs text-muted">Unknown</div>
        </div>
      </div>
      {caPct != null && (
        <p className="mt-2 text-xs text-muted">{caPct}% of located people are Canadian.</p>
      )}
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
        <MiniBars title={`Tracked actions per day (${windowLabel})`} rows={ev.eventsPerDay.map((d) => ({ day: d.day, value: d.events }))} tip={SRC.events} />
        <MiniBars title={`Visits per day (${windowLabel})`} rows={ev.eventsPerDay.map((d) => ({ day: d.day, value: d.sessions }))} tip={SRC.events} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-3 py-1 font-semibold ${diverge ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-navy"}`}
          title="Leads in your database = people who actually submitted in this date range. Website count = visits where the site's own tracking saw the form submitted. If the two differ by more than 25%, the tracking is missing something — worth a look."
        >
          {diverge ? "⚠ " : ""}Leads in your database {dbLeads} vs leads the website counted {siteLeads}
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
      <p className="mb-3 text-xs text-muted">Activity date range: {windowLabel}.<InfoDot tip={SRC.events} /></p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Funnel
          rows={ev.funnel}
          tip={SRC.events}
          title={`Every visit, step by step (${ev.totalSessions.toLocaleString("en-CA")} visits)`}
        />
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">
            Typical time between steps<InfoDot tip={SRC.events} />
          </h3>
          {ev.stepMedianMins.length === 0 ? (
            <p className="text-sm text-muted">Not enough visits yet.</p>
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
            Where people give up on the form<InfoDot tip={SRC.events} />
          </h3>
          {ev.friction.length === 0 ? (
            <p className="text-sm text-muted">No field interactions recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2">Field</th>
                  <th className="px-2 text-right" title="Visits that clicked into this field">How many clicked in</th>
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
        <div className="card overflow-x-auto p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">
            How people fill each field — time, retyping, autofill<InfoDot tip={SRC.events} />
          </h3>
          {ev.fieldTiming.length === 0 ? (
            <p className="text-sm text-muted">No field-timing signals yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2">Field</th>
                  <th className="px-2 text-right" title="Average seconds spent in the field before moving on">Avg time</th>
                  <th className="px-2 text-right" title="Total backspaces / deletes across sessions — high = a confusing or mis-validated field">Retypes</th>
                  <th className="pl-2 text-right" title="Share filled by paste or browser autofill vs typed — an unusually high rate can flag bots or returning devices">Pasted/autofilled</th>
                </tr>
              </thead>
              <tbody>
                {ev.fieldTiming.map((f) => (
                  <tr key={f.field} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-semibold capitalize text-navy">{f.field}</td>
                    <td className="px-2 text-right">{f.avgDwellSec}s</td>
                    <td className="px-2 text-right">{f.corrections || "—"}</td>
                    <td className="pl-2 text-right font-semibold">{f.pasteAutofillPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="space-y-4">
          <HBars
            title="How far down the page people scroll"
            rows={ev.scrollDepth.map((s) => ({ label: `Scrolled ${s.bucket}%+`, count: s.count }))}
            tip={SRC.events}
            share={false} // buckets are cumulative — a %-of-total would be nonsense
          />
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-bold text-navy">
              Signs of interest &amp; frustration<InfoDot tip={SRC.events} />
            </h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted" title="3+ rapid clicks in the same spot — usually a broken or confusing element">Rage clicks</span>
                <span className={`font-semibold ${ev.frustration.rageClicks > 0 ? "text-red-600" : "text-navy"}`}>{ev.frustration.rageClicks}</span>
              </div>
              <div className="flex justify-between gap-2"><span className="text-muted" title="Times a visitor switched away from the tab mid-flow (distraction / comparison-shopping)">Tab switches</span><span className="font-semibold text-navy">{ev.frustration.tabSwitches}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted" title="Copy actions on the page — often copying the offer amount or phone number">Text copied</span><span className="font-semibold text-navy">{ev.frustration.copies}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <HBars title="Phone clicks — by spot on the page" rows={ev.phoneClicks} tip={SRC.events} />
        <div className="card overflow-x-auto p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">
            Get-offer button clicks vs form opens — by spot on the page<InfoDot tip={SRC.events} />
          </h3>
          {ev.ctaPairs.length === 0 ? (
            <p className="text-sm text-muted">No button clicks recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-2">Spot on the page</th>
                  <th className="px-2 text-right" title="Clicks on a get-offer button in this spot">Clicks</th>
                  <th className="px-2 text-right" title="How many of those clicks actually opened the offer form">Form loads</th>
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
            Tools that bring people back<InfoDot tip={SRC.events} />
          </h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted">About-to-leave popup shown</span><span className="font-semibold text-navy">{ev.exitIntent.shown}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">About-to-leave popup clicked</span><span className="font-semibold text-navy">{ev.exitIntent.clicked}{exitClickRate != null ? ` (${exitClickRate}%)` : ""}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">About-to-leave popup got an email</span><span className="font-semibold text-navy">{ev.exitIntent.emailCaptured}</span></div>
            <div className="flex justify-between gap-2 border-t border-slate-100 pt-1.5"><span className="text-muted">"Resume your form" banner shown</span><span className="font-semibold text-navy">{ev.resume.shown}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted">"Resume your form" banner clicked</span><span className="font-semibold text-navy">{ev.resume.clicked}{resumeClickRate != null ? ` (${resumeClickRate}%)` : ""}</span></div>
          </div>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-navy">
            VIN lookup results<InfoDot tip={SRC.events} />
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
        <HBars title="Most-tracked actions — what's being recorded" rows={ev.topEvents} tip={SRC.events} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Sources — passive "data-sources health" hub. A card per collection method
//  with a last-data-seen status chip; click one to see what it collects and its
//  health. Data comes from /api/admin/sources (registry: lib/dataSources.ts).
// ---------------------------------------------------------------------------

function SourceStatusChip({ status }: { status: SourceStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      <span aria-hidden>{m.dot}</span> {m.label}
    </span>
  );
}

// A live "is it actually used?" pill for a "collected but not fully used" item,
// so the Sources tab reflects what's shipped — not the static brainstorm text.
function UseStatusBadge({ sourceId, label }: { sourceId: string; label: string }) {
  const st = useStatusFor(sourceId, label);
  if (!st) return null;
  const m = USE_STATUS_META[st];
  return (
    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${m.cls}`} title={m.desc}>
      {m.label}
    </span>
  );
}

// Renders the "answer key" symbols for a data point — its category tags plus,
// for a "could collect" idea, an effort tag. Hover any symbol for its meaning.
function TagMarks({ sourceId, label }: { sourceId: string; label: string }) {
  const { tags, effort } = tagsFor(sourceId, label);
  if (!tags.length && !effort) return null;
  const ordered = TAG_ORDER.filter((t) => tags.includes(t));
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-[11px] leading-none">
      {ordered.map((t) => (
        <span key={t} title={`${TAG_META[t].label} — ${TAG_META[t].desc}`} aria-label={TAG_META[t].label}>{TAG_META[t].icon}</span>
      ))}
      {effort && (
        <span title={`${EFFORT_META[effort].label} — ${EFFORT_META[effort].desc}`} aria-label={EFFORT_META[effort].label}>{EFFORT_META[effort].icon}</span>
      )}
    </span>
  );
}

const GROUP_ORDER: SourceCategory[] = ["firstParty", "connector", "tracker", "comms"];
const GROUP_HEADING: Record<SourceCategory, string> = {
  firstParty: "Your own site — data you collect directly",
  connector: "Connected platforms — data pulled in automatically",
  tracker: "Trackers — outside tools that measure your site",
  comms: "Messaging & delivery",
};

function ClarityTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-lg font-bold text-navy">{value}</div>
      <div className="text-[11px] font-medium text-muted">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function SourcesPanel({ sources, clarity }: { sources: SourceHealth[] | null; clarity: ClarityInsights | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (sources === null) {
    return <div className="card p-4 text-sm text-muted">Loading data sources…</div>;
  }
  const byId = new Map(sources.map((s) => [s.id, s]));
  const def = selected ? DATA_SOURCES.find((d) => d.id === selected) ?? null : null;
  const health = selected ? byId.get(selected) ?? null : null;
  const isLive = def?.healthKind === "liveFetch";
  const isExternal = def?.healthKind === "external";
  const groups = GROUP_ORDER.map((cat) => ({ cat, defs: DATA_SOURCES.filter((d) => d.category === cat) })).filter((g) => g.defs.length > 0);
  return (
    <>
      <p className="mb-5 max-w-3xl text-sm text-muted">
        When each way you collect data last received something.{" "}
        <span className="font-semibold text-emerald-700">Active</span> = fresh,{" "}
        <span className="font-semibold text-amber-700">Quiet</span> = nothing lately,{" "}
        <span className="font-semibold text-red-700">Check it</span> = likely broken. Mostly passive — it reads data
        you already have; the connected platforms also report whether the last automatic data pull worked. Click a source
        to see exactly what it collects.
      </p>
      <div className="card mb-5 p-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Symbol key — what each icon on a data point means</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy">
          {TAG_ORDER.map((t) => (
            <span key={t} title={TAG_META[t].desc} className="cursor-help whitespace-nowrap">
              <span className="mr-1">{TAG_META[t].icon}</span>{TAG_META[t].label}
            </span>
          ))}
          <span className="text-slate-300">|</span>
          {(["config", "dev", "paid"] as EffortTag[]).map((e) => (
            <span key={e} title={EFFORT_META[e].desc} className="cursor-help whitespace-nowrap">
              <span className="mr-1">{EFFORT_META[e].icon}</span>{EFFORT_META[e].label}
            </span>
          ))}
        </div>
        <div className="mt-1.5 text-[10px] text-muted">A data point can carry several. Effort tags (⚙️ 🔧 💵) show on “worth building” and “could collect” ideas. Hover any label or icon for its full meaning.</div>
      </div>
      {groups.map((g) => (
        <div key={g.cat} className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{GROUP_HEADING[g.cat]}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.defs.map((d) => {
              const h = byId.get(d.id);
              const active = selected === d.id;
              const live = d.healthKind === "liveFetch";
              const external = d.healthKind === "external";
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelected(active ? null : d.id)}
                  className={`card p-4 text-left transition hover:shadow-md ${active ? "ring-2 ring-brand-600" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-bold text-navy">{d.label}</div>
                    <SourceStatusChip status={h?.status ?? "empty"} />
                  </div>
                  {live ? (
                    <div className="mt-2 text-xs">
                      {h?.error ? (
                        <span className="text-red-700">{h.error}</span>
                      ) : (
                        <span className="text-muted">
                          {h?.status === "unconfigured" ? "Not connected" : h?.note || (h?.status === "quiet" ? "Connected — nothing in this date range" : "Connected")}
                          {h?.lastAt && <span className="text-slate-400"> · checked {timeAgo(h.lastAt)}</span>}
                        </span>
                      )}
                    </div>
                  ) : external ? (
                    <div className="mt-2 text-xs text-muted">
                      {h?.note || (h?.status === "unconfigured" ? "Not set up" : "Installed — check on that platform's own site")}
                    </div>
                  ) : (
                    <>
                      <div className="mt-2 text-xs text-muted">
                        Last data: <span className="font-semibold text-navy">{timeAgo(h?.lastAt ?? undefined)}</span>
                      </div>
                      <div className="text-xs text-muted">{h ? `${h.count24h} in 24h · ${h.count7d} in 7d` : "—"}</div>
                      {h?.note && <div className="mt-1 text-[11px] text-slate-500">{h.note}</div>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {def && (
        <div className="card mt-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-navy">{def.label}</h3>
              <p className="mt-0.5 text-sm text-muted">{def.purpose}</p>
            </div>
            <SourceStatusChip status={health?.status ?? "empty"} />
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Collecting now</div>
              <ul className="mt-2 space-y-1 text-sm text-navy">
                {def.collects.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span className="text-brand-600">•</span>
                    <span>{c}<TagMarks sourceId={def.id} label={c} /></span>
                  </li>
                ))}
              </ul>
              {def.envVars && def.envVars.length > 0 && (
                <div className="mt-3 text-xs text-muted">
                  Depends on:{" "}
                  {def.envVars.map((v, i) => (
                    <span key={v}>
                      {i > 0 && ", "}
                      <code className="rounded bg-slate-100 px-1">{v}</code>
                    </span>
                  ))}
                </div>
              )}
              {def.vendorUrl && (
                <div className="mt-2 text-xs">
                  <a href={def.vendorUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 hover:underline">
                    Open the platform dashboard →
                  </a>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Health</div>
              <div className="mt-2 space-y-1 text-sm text-navy">
                {isLive ? (
                  <>
                    {health?.error ? (
                      <div className="rounded-lg bg-red-50 p-2 text-red-700">{health.error}</div>
                    ) : (
                      <div>{health?.status === "unconfigured" ? "Not connected — its setup keys haven't been added." : health?.note || "Connected and returning data."}</div>
                    )}
                    {health?.lastAt && <div className="text-muted">Last successful check: {timeAgo(health.lastAt)}</div>}
                  </>
                ) : isExternal ? (
                  <>
                    <div>{health?.status === "unconfigured" ? "Not set up — its setup key hasn't been added." : "Installed — it only runs for visitors who accept cookies, so we can't confirm it from our side."}</div>
                    {health?.note && <div className="text-muted">{health.note}</div>}
                  </>
                ) : (
                  <>
                    <div>
                      Last data: <span className="font-semibold">{timeAgo(health?.lastAt ?? undefined)}</span>
                      {health?.lastAt && <span className="text-muted"> · {new Date(health.lastAt).toLocaleString("en-CA")}</span>}
                    </div>
                    <div>
                      Last 24h: <span className="font-semibold">{health?.count24h ?? 0}</span> · Last 7d:{" "}
                      <span className="font-semibold">{health?.count7d ?? 0}</span>
                    </div>
                    {health?.note && <div className="text-muted">{health.note}</div>}
                  </>
                )}
                {def.storage && (
                  <div className="text-muted">
                    Storage: <code className="rounded bg-slate-100 px-1">{def.storage}</code>
                  </div>
                )}
              </div>
              {def.fixHint && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <span className="font-semibold text-navy">If it looks off:</span> {def.fixHint}
                </div>
              )}
            </div>
          </div>
          {def.id === "clarity" && clarity && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Live numbers — last {clarity.days} days
                <InfoDot tip="Pulled from Microsoft Clarity's Data Export API. Clarity caps this at 3 days of history and 10 pulls/day, so it refreshes every few hours." />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <ClarityTile label="Visits" value={clarity.sessions.toLocaleString("en-CA")} sub={clarity.bots ? `${clarity.bots.toLocaleString("en-CA")} bots excluded` : undefined} />
                <ClarityTile label="Different visitors" value={clarity.distinctUsers.toLocaleString("en-CA")} />
                <ClarityTile label="Pages per visit" value={clarity.pagesPerSession ? clarity.pagesPerSession.toFixed(1) : "—"} />
                <ClarityTile label="How far down people scroll (avg)" value={clarity.avgScrollDepth ? `${Math.round(clarity.avgScrollDepth)}%` : "—"} />
              </div>
              {clarity.behaviors.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {clarity.behaviors.map((b) => (
                    <ClarityTile
                      key={b.key}
                      label={b.label}
                      value={b.sessions.toLocaleString("en-CA")}
                      sub={b.pct != null ? `${b.pct.toFixed(1)}% of visits` : "visits"}
                    />
                  ))}
                </div>
              )}
              <div className="mt-2 text-[11px] text-muted">
                Refreshed {timeAgo(clarity.fetchedAt)} · screen recordings + click maps are in the{" "}
                <a href="https://clarity.microsoft.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 hover:underline">
                  Clarity dashboard
                </a>
                .
              </div>
            </div>
          )}
          {def.underutilized && def.underutilized.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Collected — usage at a glance
                <InfoDot tip="What's being done with data this source already collects — everything here is live today: surfaced in the dashboard or driving an automated action. Hover an item for what it's for." />
              </div>
              <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {def.underutilized.map((it) => (
                  <li key={it.label} className="flex items-start gap-2 text-sm text-navy">
                    <span className="mt-0.5 text-amber-500">◐</span>
                    <span>{it.label}<InfoDot tip={it.why} /><TagMarks sourceId={def.id} label={it.label} /><UseStatusBadge sourceId={def.id} label={it.label} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {def.buildNext && def.buildNext.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Worth building — asks the seller for nothing extra
                <InfoDot tip="The to-do list: data or views this source could have WITHOUT asking the seller for anything extra. The pill shows how far along each is — Partly used = partially set up; Not built yet = not set up at all; Needs a setting = just a toggle in the vendor's dashboard; Waiting = built but paused until a related feature (the instant estimate, or SMS) is switched on." />
              </div>
              <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {def.buildNext.map((it) => (
                  <li key={it.label} className="flex items-start gap-2 text-sm text-navy">
                    <span className="mt-0.5 text-sky-500">◔</span>
                    <span>{it.label}<InfoDot tip={it.why} /><TagMarks sourceId={def.id} label={it.label} /><UseStatusBadge sourceId={def.id} label={it.label} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {def.opportunities && def.opportunities.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Could collect — status at a glance
                <InfoDot tip="Deliberately not collected (yet): each of these would add friction for the seller (another form field, a survey), need a paid tier, or depend on a feature that doesn't exist. Hover the effort tag (⚙️ config · 🔧 dev · 💵 paid) for what adding it would take, and the idea itself for why it might be worth it." />
              </div>
              <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {def.opportunities.map((it) => (
                  <li key={it.label} className="flex items-start gap-2 text-sm text-navy">
                    <span className="mt-0.5 text-brand-500">+</span>
                    <span>{it.label}<InfoDot tip={it.why} /><TagMarks sourceId={def.id} label={it.label} /><UseStatusBadge sourceId={def.id} label={it.label} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

// ===========================================================================
//  Ads — comprehensive Meta ad analytics with a persisted DAILY time-series.
//  Reads /api/admin/meta-insights (DynamoDB snapshots + live fallback). Switch
//  level (account/campaign/adset/ad), breakdown (age/gender/region/placement/
//  device), and Ads-Manager-style column presets; per-day trend + sortable
//  table. "Sync from Meta now" backfills on demand (no waiting for the cron).
// ===========================================================================

interface SnapRow {
  level: string; date: string; entityId: string; entityName: string;
  breakdownKey: string; breakdownValue: string; spend: number;
  metrics: Record<string, number | string | null>;
  campaignName?: string; adsetName?: string;
}

const AD_LEVELS = [
  { key: "account", label: "Account" },
  { key: "campaign", label: "Campaign" },
  { key: "adset", label: "Ad set" },
  { key: "ad", label: "Ad" },
];
const AD_BREAKDOWNS: Record<string, { key: string; label: string }[]> = {
  account: [{ key: "none", label: "None" }],
  adset: [{ key: "none", label: "None" }],
  ad: [{ key: "none", label: "None" }],
  campaign: [
    { key: "none", label: "None" },
    { key: "age", label: "Age" },
    { key: "gender", label: "Gender" },
    { key: "region", label: "Region" },
    { key: "placement", label: "Where it showed" },
    { key: "device", label: "Device" },
  ],
};

interface Agg {
  key: string;
  name: string;
  spend: number;
  sums: Record<string, number>;
  cats: Record<string, string>;
}
// Metric accessors over summed additive bases (conversion action_types match the
// probe: action.lead / landing_page_view / purchase / view_content / ...).
const gLeads = (a: Agg) => a.sums["action.lead"] || a.sums["action.offsite_conversion.fb_pixel_lead"] || a.sums["action.onsite_web_lead"] || 0;
const gLPV = (a: Agg) => a.sums["action.landing_page_view"] || a.sums["action.omni_landing_page_view"] || 0;
const gLinkClicks = (a: Agg) => a.sums["inline_link_clicks"] || 0;
const gClicks = (a: Agg) => a.sums["clicks"] || 0;
const gImpr = (a: Agg) => a.sums["impressions"] || 0;
const gReach = (a: Agg) => a.sums["reach"] || 0;
const gOutbound = (a: Agg) => a.sums["outbound_clicks"] || 0;
const gPurch = (a: Agg) => a.sums["action.purchase"] || a.sums["action.offsite_conversion.fb_pixel_purchase"] || a.sums["action.omni_purchase"] || 0;
const gPurchVal = (a: Agg) => a.sums["value.purchase"] || a.sums["value.offsite_conversion.fb_pixel_purchase"] || a.sums["value.omni_purchase"] || 0;
const gViewContent = (a: Agg) => a.sums["action.view_content"] || a.sums["action.offsite_conversion.fb_pixel_view_content"] || 0;
const gIC = (a: Agg) => a.sums["action.initiate_checkout"] || a.sums["action.offsite_conversion.fb_pixel_initiate_checkout"] || 0;
const gVideoPlays = (a: Agg) => a.sums["video_plays"] || 0;
const gThru = (a: Agg) => a.sums["video_thruplay"] || 0;
const divS = (n: number, d: number) => (d ? n / d : 0);

type ColType = "money" | "money2" | "int" | "pct" | "num" | "rank";
interface Col { key: string; label: string; type: ColType; get: (a: Agg) => number | string | undefined; tip?: string }
const COLUMN_PRESETS: { key: string; label: string; cols: Col[] }[] = [
  { key: "performance", label: "Performance", cols: [
    { key: "leads", label: "Leads", type: "int", get: gLeads },
    { key: "cpl", label: "Cost / lead", type: "money2", get: (a) => divS(a.spend, gLeads(a)) },
    { key: "lpv", label: "Reached your site", type: "int", get: gLPV },
    { key: "reach", label: "People reached*", type: "int", get: gReach, tip: "Added up day by day, so the same person can be counted more than once — Meta's own total for the full period will be lower." },
    { key: "impr", label: "Times shown", type: "int", get: gImpr },
    { key: "freq", label: "Times seen per person*", type: "num", get: (a) => divS(gImpr(a), gReach(a)) },
    { key: "spend", label: "Spend", type: "money", get: (a) => a.spend },
  ]},
  { key: "delivery", label: "How often ads showed", cols: [
    { key: "reach", label: "People reached*", type: "int", get: gReach },
    { key: "impr", label: "Times shown", type: "int", get: gImpr },
    { key: "freq", label: "Times seen per person*", type: "num", get: (a) => divS(gImpr(a), gReach(a)) },
    { key: "cpm", label: "Cost per 1,000 times shown", type: "money2", get: (a) => divS(a.spend, gImpr(a)) * 1000 },
    { key: "spend", label: "Spend", type: "money", get: (a) => a.spend },
    { key: "quality_ranking", label: "Quality vs similar ads", type: "rank", get: (a) => a.cats["quality_ranking"] },
    { key: "engagement_rate_ranking", label: "Interactions vs similar ads", type: "rank", get: (a) => a.cats["engagement_rate_ranking"] },
    { key: "conversion_rate_ranking", label: "Results vs similar ads", type: "rank", get: (a) => a.cats["conversion_rate_ranking"] },
  ]},
  { key: "clicks", label: "Clicks", cols: [
    { key: "clicks", label: "Clicks (all)", type: "int", get: gClicks },
    { key: "ctr", label: "Click rate", type: "pct", get: (a) => divS(gClicks(a), gImpr(a)) * 100 },
    { key: "cpc", label: "Cost per click", type: "money2", get: (a) => divS(a.spend, gClicks(a)) },
    { key: "linkclicks", label: "Link clicks", type: "int", get: gLinkClicks },
    { key: "linkctr", label: "Link click rate", type: "pct", get: (a) => divS(gLinkClicks(a), gImpr(a)) * 100 },
    { key: "cplc", label: "Cost per link click", type: "money2", get: (a) => divS(a.spend, gLinkClicks(a)) },
    { key: "outbound", label: "Clicks off Meta", type: "int", get: gOutbound },
    { key: "lpv", label: "Reached your site", type: "int", get: gLPV },
    { key: "spend", label: "Spend", type: "money", get: (a) => a.spend },
  ]},
  { key: "video", label: "Video", cols: [
    { key: "plays", label: "Plays", type: "int", get: gVideoPlays },
    { key: "thru", label: "Watched 15s or to end", type: "int", get: gThru },
    { key: "cpt", label: "Cost per 15s/full watch", type: "money2", get: (a) => divS(a.spend, gThru(a)) },
    { key: "p25", label: "Watched 25%", type: "int", get: (a) => a.sums["video_p25"] || 0 },
    { key: "p50", label: "Watched 50%", type: "int", get: (a) => a.sums["video_p50"] || 0 },
    { key: "p75", label: "Watched 75%", type: "int", get: (a) => a.sums["video_p75"] || 0 },
    { key: "p100", label: "Watched 100%", type: "int", get: (a) => a.sums["video_p100"] || 0 },
    { key: "spend", label: "Spend", type: "money", get: (a) => a.spend },
  ]},
  { key: "conversions", label: "Leads & sales", cols: [
    { key: "linkclicks", label: "Link clicks", type: "int", get: gLinkClicks },
    { key: "lpv", label: "Reached your site", type: "int", get: gLPV },
    { key: "vc", label: "Entered car details", type: "int", get: gViewContent },
    { key: "ic", label: "Started contact form", type: "int", get: gIC },
    { key: "leads", label: "Leads", type: "int", get: gLeads },
    { key: "cpl", label: "Cost / lead", type: "money2", get: (a) => divS(a.spend, gLeads(a)) },
    { key: "purch", label: "Purchases", type: "int", get: gPurch },
    { key: "roas", label: "$ back per $1 of ads", type: "num", get: (a) => divS(gPurchVal(a), a.spend) },
    { key: "spend", label: "Spend", type: "money", get: (a) => a.spend },
  ]},
];
// Rate/cost/ratio metrics are recomputed from summed bases, so they must NOT be
// naively summed across days.
const NON_SUM = new Set(["ctr", "cpc", "cpm", "frequency", "inline_link_click_ctr", "cost_per_inline_link_click", "outbound_clicks_ctr", "cost_per_outbound_click", "website_ctr", "cost_per_inline_post_engagement", "cost_per_thruplay", "video_avg_secs"]);

function aggregateAds(rows: SnapRow[], breakdown: string) {
  const map = new Map<string, Agg>();
  const perDay = new Map<string, { spend: number; leads: number; impressions: number; linkClicks: number }>();
  for (const r of rows) {
    const key = breakdown === "none" ? r.entityId : r.breakdownValue;
    const name = breakdown === "none" ? r.entityName : r.breakdownValue;
    let a = map.get(key);
    if (!a) { a = { key, name, spend: 0, sums: {}, cats: {} }; map.set(key, a); }
    a.spend += r.spend || 0;
    for (const [k, v] of Object.entries(r.metrics || {})) {
      if (typeof v === "number") { if (!NON_SUM.has(k)) a.sums[k] = (a.sums[k] || 0) + v; }
      else if (typeof v === "string" && v) a.cats[k] = v; // categorical (rankings) — last day wins
    }
    const pd = perDay.get(r.date) || perDay.set(r.date, { spend: 0, leads: 0, impressions: 0, linkClicks: 0 }).get(r.date);
    if (pd) {
      pd.spend += r.spend || 0;
      pd.leads += Number(r.metrics?.["action.lead"]) || 0;
      pd.impressions += Number(r.metrics?.["impressions"]) || 0;
      pd.linkClicks += Number(r.metrics?.["inline_link_clicks"]) || 0;
    }
  }
  const aggs = [...map.values()];
  return { aggs, perDay };
}

function windowForRange(range: RangeState): { since: string; until: string } {
  const iso = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
  if (range.preset === "custom" && range.dateFrom && range.dateTo) return { since: range.dateFrom, until: range.dateTo };
  const d = presetDates(range.preset);
  if (d.dateFrom && d.dateTo) return { since: d.dateFrom, until: d.dateTo };
  const to = new Date();
  return { since: iso(new Date(to.getTime() - 364 * 86_400_000)), until: iso(to) };
}

const RANK_STYLE: Record<string, string> = {
  above_average: "bg-green-50 text-green-700",
  average: "bg-slate-100 text-slate-600",
  below_average_10: "bg-red-50 text-red-700",
  below_average_20: "bg-red-50 text-red-700",
  below_average_35: "bg-red-50 text-red-700",
};
function fmtCell(type: ColType, v: number | string | undefined): ReactNode {
  if (v === undefined || v === null || v === "") return "—";
  if (type === "rank") {
    const s = String(v);
    const label = s.replace(/_/g, " ").replace("below average", "below avg");
    return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${RANK_STYLE[s] || "bg-slate-100 text-slate-500"}`}>{label}</span>;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (type === "money") return money(n);
  if (type === "money2") return money2(n);
  if (type === "pct") return `${n.toFixed(2)}%`;
  if (type === "num") return n.toFixed(2);
  return Math.round(n).toLocaleString("en-CA"); // int
}

function AdsTab({ range }: { range: RangeState }) {
  const [level, setLevel] = useState("campaign");
  const [breakdown, setBreakdown] = useState("none");
  const [presetKey, setPresetKey] = useState("performance");
  const [rows, setRows] = useState<SnapRow[] | null>(null);
  const [meta, setMeta] = useState<{ configured: boolean; source: string; error?: string }>({ configured: true, source: "" });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [trendMetric, setTrendMetric] = useState<"spend" | "leads" | "impressions" | "cpl">("spend");

  const { since, until } = useMemo(() => windowForRange(range), [range]);
  const bdOptions = AD_BREAKDOWNS[level] || [{ key: "none", label: "None" }];

  useEffect(() => {
    if (!bdOptions.some((b) => b.key === breakdown)) setBreakdown("none");
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/meta-insights?level=${level}&breakdown=${breakdown}&since=${since}&until=${until}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setRows(d.rows || []); setMeta({ configured: d.configured !== false, source: d.source || "", error: d.error }); } })
      .catch(() => { if (!cancelled) { setRows([]); setMeta({ configured: true, source: "" }); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [level, breakdown, since, until, reloadKey]);

  async function sync() {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await fetch(`/api/admin/meta-insights`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ since, until }) });
      const d = await r.json();
      setSyncMsg(d.configured === false ? "Meta not connected." : `Synced ${d.written} rows${d.errors?.length ? ` · ${d.errors.length} part(s) couldn't be updated` : ""}.`);
      setReloadKey((k) => k + 1);
    } catch { setSyncMsg("Sync failed."); }
    finally { setSyncing(false); }
  }

  const preset = COLUMN_PRESETS.find((p) => p.key === presetKey) || COLUMN_PRESETS[0];
  const { aggs, perDay } = useMemo(() => aggregateAds(rows || [], breakdown), [rows, breakdown]);
  const totals = useMemo(() => ({
    spend: aggs.reduce((s, a) => s + a.spend, 0),
    impressions: aggs.reduce((s, a) => s + gImpr(a), 0),
    reach: aggs.reduce((s, a) => s + gReach(a), 0),
    leads: aggs.reduce((s, a) => s + gLeads(a), 0),
    linkClicks: aggs.reduce((s, a) => s + gLinkClicks(a), 0),
    lpv: aggs.reduce((s, a) => s + gLPV(a), 0),
  }), [aggs]);

  const sorted = useMemo(() => {
    const col = preset.cols.find((c) => c.key === sortKey);
    const num = (a: Agg) => (sortKey === "name" ? a.name : col ? col.get(a) : a.spend);
    return [...aggs].sort((x, y) => {
      const vx = num(x), vy = num(y);
      if (typeof vx === "string" || typeof vy === "string") return sortDir === "asc" ? String(vx ?? "").localeCompare(String(vy ?? "")) : String(vy ?? "").localeCompare(String(vx ?? ""));
      return sortDir === "asc" ? (Number(vx) || 0) - (Number(vy) || 0) : (Number(vy) || 0) - (Number(vx) || 0);
    });
  }, [aggs, preset, sortKey, sortDir]);

  const trendDays = useMemo(() => {
    const arr = [...perDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return arr.map(([date, d]) => ({ date, value: trendMetric === "spend" ? d.spend : trendMetric === "leads" ? d.leads : trendMetric === "impressions" ? d.impressions : d.leads ? d.spend / d.leads : 0 }));
  }, [perDay, trendMetric]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const btn = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

  return (
    <div className="space-y-4">
      {!meta.configured && (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="font-semibold">Meta not connected.</span> Set <code className="rounded bg-white/70 px-1">META_MARKETING_TOKEN</code> + <code className="rounded bg-white/70 px-1">META_AD_ACCOUNT_ID</code> in Amplify to show data here.
        </div>
      )}

      {/* controls */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">View by</span>
          {AD_LEVELS.map((l) => <button key={l.key} className={btn(level === l.key)} onClick={() => setLevel(l.key)}>{l.label}</button>)}
        </div>
        {bdOptions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Break down by</span>
            {bdOptions.map((b) => <button key={b.key} className={btn(breakdown === b.key)} onClick={() => setBreakdown(b.key)}>{b.label}</button>)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Columns</span>
          {COLUMN_PRESETS.map((p) => <button key={p.key} className={btn(presetKey === p.key)} onClick={() => { setPresetKey(p.key); setSortKey("spend"); }}>{p.label}</button>)}
          <div className="ml-auto flex items-center gap-2">
            {syncMsg && <span className="text-xs text-muted">{syncMsg}</span>}
            <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              {syncing ? "Syncing…" : "Sync from Meta now"}
            </button>
          </div>
        </div>
      </div>

      {/* summary tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCard label="Spend" value={money(totals.spend)} />
        <StatCard label="Times shown" value={Math.round(totals.impressions).toLocaleString("en-CA")} />
        <StatCard label="Link clicks" value={Math.round(totals.linkClicks).toLocaleString("en-CA")} />
        <StatCard label="Reached your site" value={Math.round(totals.lpv).toLocaleString("en-CA")} />
        <StatCard label="Leads" value={Math.round(totals.leads).toLocaleString("en-CA")} />
        <StatCard label="Cost / lead" value={money2(totals.leads ? totals.spend / totals.leads : 0)} />
      </div>

      {/* per-day trend */}
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-navy">Daily trend</h3>
          <div className="ml-auto flex gap-1">
            {(["spend", "leads", "impressions", "cpl"] as const).map((m) => (
              <button key={m} className={`rounded px-2 py-1 text-xs font-semibold ${trendMetric === m ? "bg-brand text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`} onClick={() => setTrendMetric(m)}>
                {m === "cpl" ? "Cost/lead" : m === "impressions" ? "Times shown" : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {trendDays.length === 0 ? (
          <p className="text-sm text-muted">{loading ? "Loading…" : "No data for this date range yet — try “Sync from Meta now”."}</p>
        ) : (
          <DayBarChart
            rows={trendDays.map((d) => ({ label: d.date, value: d.value }))}
            height={120}
            format={trendMetric === "spend" || trendMetric === "cpl" ? (n) => money2(n) : (n) => Math.round(n).toLocaleString("en-CA")}
            unit={trendMetric === "leads" ? "leads" : trendMetric === "impressions" ? "times shown" : ""}
            accent="bg-brand"
          />
        )}
      </div>

      {/* table */}
      <div className="card overflow-x-auto p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-navy">{AD_LEVELS.find((l) => l.key === level)?.label} · {preset.label}</h3>
          <span className="text-xs text-muted">
            {meta.source === "live" ? "live from Meta (saved history still building)" : meta.source === "store" ? "stored history" : ""} · {since} → {until}
          </span>
        </div>
        {meta.error && <p className="mb-2 text-xs text-red-600">Meta: {meta.error}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-muted">
              <th className="cursor-pointer py-2 pr-2" onClick={() => toggleSort("name")}>{breakdown === "none" ? "Name" : bdOptions.find((b) => b.key === breakdown)?.label}{sortKey === "name" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</th>
              {preset.cols.map((c) => (
                <th key={c.key} className="cursor-pointer py-2 pl-2 text-right" onClick={() => toggleSort(c.key)} title={c.tip}>
                  {c.label}{c.tip ? <InfoDot tip={c.tip} /> : ""}{sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={preset.cols.length + 1} className="py-6 text-center text-sm text-muted">{loading ? "Loading…" : "Nothing here yet. Use “Sync from Meta now” to pull your data."}</td></tr>
            ) : sorted.map((a) => (
              <tr key={a.key} className="border-b border-slate-50 hover:bg-slate-50/60">
                <td className="py-2 pr-2 font-medium text-navy">{a.name}</td>
                {preset.cols.map((c) => <td key={c.key} className="py-2 pl-2 text-right tabular-nums">{fmtCell(c.type, c.get(a))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-muted">
          Daily numbers are added up over the date range; rates (click rate, cost per click, cost per 1,000 shown, cost per lead) are then recalculated from those totals. <span className="font-semibold">People reached*</span> / <span className="font-semibold">Times seen per person*</span> add each day together, so the same person can be counted more than once (Meta’s own reach counts each person only once). History is saved automatically every night; “Sync from Meta now” updates it right away.
        </p>
      </div>
    </div>
  );
}

type Tab = "sources" | "overview" | "acquisition" | "funnel" | "ads" | "emails" | "people";

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
  const [adLevel, setAdLevel] = useState<{ configured: boolean; ads: AdInsightAdRanked[]; regions: RegionInsightRow[]; placements: PlacementInsightRow[] } | null>(null);
  // Data-sources health hub (passive last-seen) — fetched once, range-independent.
  const [sources, setSources] = useState<SourceHealth[] | null>(null);
  // Clarity's aggregate stats (Data Export API) ride on the same fetch.
  const [clarityInsights, setClarityInsights] = useState<ClarityInsights | null>(null);
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
      .catch(() => { if (!cancelled) setAdLevel({ configured: false, ads: [], regions: [], placements: [] }); });
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

  // Data-sources health — global (not range-scoped), fetched once on mount.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/sources`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setSources(d.sources || []); setClarityInsights(d.clarity ?? null); } })
      .catch(() => { if (!cancelled) setSources([]); });
    return () => { cancelled = true; };
  }, []);

  const metaConfigured = ads?.configured ?? adLevel?.configured ?? null;

  async function deleteProfile(p: Profile) {
    // Delete ANY profile — including referral-only or chat-only people (they have no
    // lead). Archives every underlying record so the whole person drops out of the
    // datasets (profiles, funnel, revenue, scores), restorable from the Deleted tab.
    if (!p.leadIds.length && !p.referralIds.length && !p.chatIds.length) {
      alert("Nothing to delete for this profile.");
      return;
    }
    if (!confirm(`Delete ${p.name || p.emails[0] || p.phones[0] || "this profile"}? They're removed from your analytics, but you can restore them from the admin Deleted tab.`)) return;
    setDeletedIds((prev) => new Set(prev).add(p.id));
    const at = new Date().toISOString();
    const h = { "Content-Type": "application/json" };
    await Promise.all([
      ...p.leadIds.map((id) =>
        fetch("/api/admin/leads", {
          method: "PATCH",
          headers: h,
          body: JSON.stringify({ type: "lead", id, patch: { archived: true, archivedAt: at } }),
        }).catch(() => {}),
      ),
      ...p.referralIds.map((id) =>
        fetch("/api/admin/leads", {
          method: "PATCH",
          headers: h,
          body: JSON.stringify({ type: "referral", id, patch: { archived: true, archivedAt: at } }),
        }).catch(() => {}),
      ),
      ...p.chatIds.map((id) =>
        fetch("/api/admin/chats", {
          method: "PATCH",
          headers: h,
          body: JSON.stringify({ conversationId: id, archived: true }),
        }).catch(() => {}),
      ),
    ]);
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

  // First-party real leads bucketed by province (geo region, lowercased for a
  // tolerant match to Meta's region label). Meta's regional breakdown returns NO
  // `lead` action — website conversions can't be attributed by region — so the
  // "By region" panel joins Meta's per-region SPEND to YOUR own leads instead.
  const leadsByRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of filtered) {
      if (!p.hasRealLead) continue;
      const r = (p.geo?.region || "").trim().toLowerCase();
      if (r) m.set(r, (m.get(r) || 0) + 1);
    }
    return m;
  }, [filtered]);

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
  const activeFilters = [filters.country, filters.region, filters.source, filters.adset, filters.device, filters.stage, filters.scoreBand].filter(Boolean).length;

  const booked = view.funnelByRank.booked;
  // Sidebar entries — keys are unchanged (only the display labels went plain):
  // "sources" shows tracking health, "acquisition" shows where visitors come from.
  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <NavIcon><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></NavIcon> },
    { key: "acquisition", label: "Traffic", icon: <NavIcon><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></NavIcon> },
    { key: "funnel", label: "Funnel", icon: <NavIcon><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></NavIcon> },
    { key: "ads", label: "Ads", icon: <NavIcon><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></NavIcon> },
    { key: "emails", label: "Emails", icon: <NavIcon><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></NavIcon> },
    { key: "people", label: "People", icon: <NavIcon><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></NavIcon> },
    { key: "sources", label: "Data health", icon: <NavIcon><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></NavIcon> },
  ];

  return (
    <div className="container-x py-8">
      {/* Mobile/tablet title row — on lg+ the title lives inside the sticky
          sidebar instead, so it scrolls down with the nav. */}
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <div>
          <h1 className="text-2xl font-bold text-navy">Customer Analytics</h1>
          <p className="text-sm text-muted">One profile per person — ad → visit → form → replies → close.</p>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-brand-600 hover:underline">← Leads</Link>
      </div>

      <div className="flex items-start gap-6">
        {/* Left sidebar — page title + nav, pinned together as one unit.
            sticky top-20 clears the 72px site header (a shorter offset would
            tuck it behind the header). Internal scroll guard for short
            viewports. Hidden below lg, where the strip + title row take over. */}
        <div className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto lg:block">
          <Link href="/admin" className="mb-3 inline-block text-sm font-semibold text-brand-600 hover:underline">← Leads</Link>
          <h1 className="text-xl font-bold text-navy">Customer Analytics</h1>
          <p className="mb-4 text-xs text-muted">One profile per person — ad → visit → form → replies → close.</p>
          <nav className="flex flex-col gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${tab === t.key ? "bg-brand-50 text-brand-700" : "text-navy hover:bg-slate-100"}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="min-w-0 flex-1">
          {/* Mobile/tablet nav strip */}
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 lg:hidden">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-navy"}`}
              >
                {t.label}
              </button>
            ))}
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

      {/* ---- TAB: SOURCES ---- */}
      {tab === "sources" && <SourcesPanel sources={sources} clarity={clarityInsights} />}

      {/* ---- TAB 1: OVERVIEW ---- */}
      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Leads" value={String(view.totals.leads)} tip={SRC.site} delta={prevView ? <Delta now={view.totals.leads} prev={prevView.totals.leads} /> : undefined} />
            <StatCard label="Booked" value={String(booked)} tip="Your website's database — leads that reached a booked inspection (scheduled or closed)." delta={prevView ? <Delta now={booked} prev={prevView.funnelByRank.booked} /> : undefined} />
            <StatCard label="Closed" value={String(view.totals.closed)} sub={`${money(view.totals.margin)} margin${view.totals.marginIsEstimate ? " · est" : ""}`} tip="Deals marked closed. Margin = sale price (actual, or expected if not sold yet) minus your all-in cost (logged all-in expenses when present, else the bought-for price). “est” means it still includes a car you've bought but not sold yet." delta={prevView ? <Delta now={view.totals.closed} prev={prevView.totals.closed} /> : undefined} />
            <StatCard
              label="How fast you respond"
              value={fmtMins(view.totals.medianResponseMins)}
              sub={view.totals.pctUnder5Min != null ? `${view.totals.pctUnder5Min}% under 5 min` : undefined}
              tip="Typical time from when a lead comes in to your first real contact (offer sent or marked contacted). Research shows replying within 5 minutes makes a lead about 21x more likely to turn into a real conversation."
            />
            <StatCard label="People" value={String(view.totals.people)} tip={SRC.site} delta={prevView ? <Delta now={view.totals.people} prev={prevView.totals.people} /> : undefined} />
            <StatCard label="Abandoned" value={String(view.totals.partials)} sub="started, didn't finish" tip="Your website's database — visitors who started the form but never finished (their partly-filled answers are still captured)." delta={prevView ? <Delta now={view.totals.partials} prev={prevView.totals.partials} /> : undefined} />
          </div>

          <Section title="From ad spend to margin — per campaign">
            {meta.approx && (
              <p className="mb-2 text-xs text-amber-700">Meta spend approximated to {meta.range.replace("last_", "").replace("d", " days")} — Meta can only report 7, 30, or 90 days at a time.</p>
            )}
            <FunnelEconomics profiles={filtered} ads={adLevel?.ads || []} configured={Boolean(adLevel?.configured)} loading={adLevel === null} dateBounds={dateBounds} />
          </Section>

          <Section title="Data health" tip={SRC.events}>
            {!events.all || events.all.totalEvents === 0 ? (
              <div className="card p-4 text-sm text-muted">
                <span className="font-semibold text-navy">No events collected yet.</span> Data starts flowing
                automatically once the <code className="rounded bg-slate-100 px-1">AutoOfferEvents</code> table
                exists in DynamoDB (one-time setup) — every visit after that is recorded automatically by your own site.
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
          <Section title="Ad performance (Meta) — spend & cost-per-lead" tip="Spend, times shown, and link clicks come straight from Meta; leads & cost per lead from Meta’s tracking code on your site; margin & return per $1 of ads from your own closed deals.">
            {meta.approx && (
              <p className="mb-2 text-xs text-amber-700">Meta spend approximated to {meta.range.replace("last_", "").replace("d", " days")} — Meta can only report 7, 30, or 90 days at a time.</p>
            )}
            {ads === null ? (
              <div className="card p-4 text-sm text-muted">Loading ad performance…</div>
            ) : !ads.configured ? (
              <div className="card p-4 text-sm text-muted">
                <span className="font-semibold text-navy">Meta ads not connected yet.</span> Add{" "}
                <code className="rounded bg-slate-100 px-1">META_MARKETING_TOKEN</code> and{" "}
                <code className="rounded bg-slate-100 px-1">META_AD_ACCOUNT_ID</code> in Amplify to see spend, cost per lead, and return on ad spend here.
              </div>
            ) : (
              <MetaCampaignTable profiles={profiles} insights={ads.insights} days={ga4.days} />
            )}
          </Section>

          <Section title="Ad-by-ad results — which ads grab & keep attention" tip="From Meta's ad system — one row per individual ad.">
            {adLevel === null ? (
              <div className="card p-4 text-sm text-muted">Loading ads…</div>
            ) : !adLevel.configured ? (
              <div className="card p-4 text-sm text-muted">Meta ads not connected — per-ad numbers appear once the Meta connection is set up.</div>
            ) : (
              <>
                <CreativeTable ads={adLevel.ads} />
                {(adLevel.regions.length > 0 || adLevel.placements.length > 0) && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <BreakdownTable
                      title="By region"
                      tip="Spend is what Meta spent showing ads in each province. Leads are leads from your own website located in that province — Meta doesn't report website leads by region, so this matches them up from your own data instead. (Cost/lead = Meta spend in that province ÷ your leads in the current view.)"
                      leadsTip="Leads from your own website whose location falls in this province."
                      rows={adLevel.regions.map((r) => ({ label: r.region, spend: r.spend, leads: leadsByRegion.get(r.region.trim().toLowerCase()) }))}
                    />
                    <BreakdownTable
                      title="Where your ads showed"
                      tip="From Meta — spend and leads split by where your ads showed (Facebook vs Instagram, feed vs stories, etc.)."
                      rows={adLevel.placements.map((p) => ({ label: `${p.platform} · ${p.position}`, spend: p.spend, leads: p.leads }))}
                    />
                  </div>
                )}
              </>
            )}
          </Section>

          <Section title="Website visitors (Google Analytics) — everyone who visited" tip={SRC.ga4}>
            <TrafficGa4 days={ga4.days} approx={ga4.approx} />
          </Section>

          <Section title="Where people come from">
            <div className="grid gap-4 lg:grid-cols-2">
              <HBars title="By source" rows={view.bySource} tip={SRC.siteGrouped} />
              <HBars title="By campaign" rows={view.byCampaign} tip={SRC.siteGrouped} />
              <HBars title="First pages people land on" rows={byLandingPath(filtered)} tip="The first page each person entered your site on — shows which SEO pages / ad links actually pull people in." />
              <HBars title="Started the form but quit — by source" rows={abandonersBySource(filtered)} tip="Which sources send people who START the form but don't finish — interested people worth following up with." />
            </div>
          </Section>

          <Section title="What kinds of cars each source brings in" tip="Real leads only: the most common vehicle make per campaign/source and the share that are high-value, so you can judge channels on buyable cars, not just clicks.">
            <CampaignVehicleCard profiles={filtered} />
          </Section>

          <Section title="Left mid-form with a phone number — call these now" tip="People who started the form and left a phone number but never submitted. Newest first — call or text while they're warm.">
            <WarmAbandonersCard profiles={filtered} />
          </Section>

          <Section
            title="Show ads to these people again — export lists for Meta"
            tip="Your website's database (follows the filter bar above). Meta scrambles the uploaded file in your browser before anything is sent; Meta only ever receives the scrambled version, used solely to match people to ads."
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

          <Section title="Website funnel & where the form loses people — every visitor" tip={SRC.events}>
            {!evWindow.data || evWindow.data.totalEvents === 0 ? (
              <div className="card p-4 text-sm text-muted">
                <span className="font-semibold text-navy">No visitor activity recorded for this time range.</span> Data starts flowing
                automatically once the <code className="rounded bg-slate-100 px-1">AutoOfferEvents</code> table
                exists in DynamoDB (one-time setup) — every visit after that is recorded automatically by your own site.
              </div>
            ) : (
              <EventDetails ev={evWindow.data} windowLabel={evWindow.label} />
            )}
          </Section>
        </>
      )}

      {/* ---- TAB: ADS (comprehensive Meta ad analytics, persisted daily) ---- */}
      {tab === "ads" && <AdsTab range={range} />}

      {/* ---- TAB: EMAILS (previews + delivery analytics) ---- */}
      {tab === "emails" && <EmailsTab {...windowForRange(range)} />}

      {/* ---- TAB 4: PEOPLE ---- */}
      {tab === "people" && (
        <>
          <Section title="Compare groups — how different groups respond">
            <SegmentView rows={segments} dim={dim} setDim={setDim} tip={SRC.siteGrouped} />
          </Section>

          <Section title="Geography">
            <div className="space-y-4">
              <GeoSplit profiles={filtered} />
              <div className="grid gap-4 lg:grid-cols-2">
                <HBars title="By country" rows={view.byCountry} tip={SRC.geo} />
                <HBars title="By province / region" rows={view.byRegion} tip={SRC.geo} />
              </div>
            </div>
          </Section>

          <Section title="Devices, vehicles & other breakdowns">
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
                Sort best leads first
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
      </div>
    </div>
  );
}
