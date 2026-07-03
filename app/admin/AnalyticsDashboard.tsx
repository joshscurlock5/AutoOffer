"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AnalyticsData } from "@/lib/analyticsData";
import type { Profile } from "@/lib/profiles";

// ---------------------------------------------------------------------------
//  Customer-360 analytics dashboard. Renders per-person profiles + first-party
//  charts, all from data computed server-side (lib/analyticsData → lib/profiles).
//  Hand-rolled bars/funnel (CSS width %) — no charting dependency.
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtDur(ms?: number): string {
  if (!ms || ms < 1000) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${(m / 60).toFixed(1)}h`;
}

function money(n?: number): string {
  return n ? `$${Math.round(n).toLocaleString("en-CA")}` : "—";
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Horizontal labelled bars. */
function HBars({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
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

/** The conversion funnel as descending bars with step-to-step %. */
function Funnel({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">Conversion funnel</h3>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].count : 0;
          const pct = i > 0 && prev > 0 ? Math.round((r.count / prev) * 100) : null;
          return (
            <div key={r.label} className="flex items-center gap-2 text-sm">
              <div className="w-28 shrink-0 text-muted">{r.label}</div>
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

/** Compact vertical bars for leads-over-time. */
function VBars({ title, rows }: { title: string; rows: { date: string; leads: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No leads in the last 30 days.</p>
      ) : (
        <div className="flex h-28 items-end gap-1">
          {rows.map((r) => (
            <div key={r.date} className="flex-1 rounded-t bg-brand-600/80" style={{ height: `${(r.leads / max) * 100}%` }} title={`${r.date}: ${r.leads}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileRow({ p }: { p: Profile }) {
  const [open, setOpen] = useState(false);
  const a = p.attribution;
  return (
    <div className="card p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-navy">{p.name || p.emails[0] || p.phones[0] || "(no name)"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STAGE_STYLE[p.stage] || "bg-slate-100 text-slate-600"}`}>{p.stage}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">via {p.source}</span>
          </div>
          <div className="mt-1 truncate text-sm text-muted">
            {[...p.phones, ...p.emails].join(" · ") || "no contact"}
          </div>
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
          {/* Attribution + behavior */}
          <div className="space-y-1.5 text-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Where they came from</div>
            <Row k="Source" v={p.source} />
            {a?.utmCampaign && <Row k="Campaign" v={a.utmCampaign} />}
            {a?.utmMedium && <Row k="Medium" v={a.utmMedium} />}
            {a?.utmContent && <Row k="Ad / content" v={a.utmContent} />}
            {a?.referrer && <Row k="Referrer" v={a.referrer} />}
            {a?.landingPath && <Row k="Landed on" v={a.landingPath} />}
            <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">On-site behavior</div>
            <Row k="Time on site" v={fmtDur(p.behavior?.timeOnSiteMs)} />
            <Row k="Pageviews" v={String(p.behavior?.pageviews ?? "—")} />
            <Row k="Furthest step" v={p.behavior?.maxFunnelStep ? `Step ${p.behavior.maxFunnelStep}` : "—"} />
            {p.offer && <Row k="Offer" v={`${money(p.offer.low)}–${money(p.offer.high)}`} />}
            {p.appointmentAt && <Row k="Inspection" v={new Date(p.appointmentAt).toLocaleString("en-CA")} />}
          </div>
          {/* Timeline */}
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
            {p.leadIds.length > 0 && (
              <Link href="/admin" className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">
                Open in Leads →
              </Link>
            )}
          </div>
        </div>
      )}
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

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const { profiles, aggregates: agg } = data;
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter((p) =>
      [p.name, ...p.emails, ...p.phones, p.source, ...p.vehicles, p.attribution?.utmCampaign]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [q, profiles]);

  return (
    <div className="container-x py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Customer Analytics</h1>
          <p className="text-sm text-muted">One profile per person — ad → visit → form → replies → close.</p>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-brand-600 hover:underline">← Leads</Link>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="People" value={String(agg.totals.profiles)} />
        <StatCard label="Leads" value={String(agg.totals.leads)} />
        <StatCard label="Abandoned" value={String(agg.totals.partials)} sub="started, no submit" />
        <StatCard label="Lookups" value={String(agg.totals.lookups)} />
        <StatCard label="Closed" value={String(agg.revenue.closed)} sub={money(agg.revenue.total)} />
        <StatCard label="Avg response" value={agg.avgFirstResponseMins == null ? "—" : agg.avgFirstResponseMins < 60 ? `${agg.avgFirstResponseMins}m` : `${(agg.avgFirstResponseMins / 60).toFixed(1)}h`} />
      </div>

      {/* Charts */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Funnel rows={agg.funnel} />
        <VBars title="Leads — last 30 days" rows={agg.overTime} />
        <HBars title="By source" rows={agg.bySource} />
        <HBars title="By campaign" rows={agg.byCampaign} />
        <HBars title="By status" rows={agg.byStatus} />
      </div>

      {/* Profiles */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-navy">Profiles ({filtered.length})</h2>
        <input
          className="field max-w-xs"
          placeholder="Search name, phone, email, campaign…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted">No profiles match.</p>
        ) : (
          filtered.map((p) => <ProfileRow key={p.id} p={p} />)
        )}
      </div>
    </div>
  );
}
