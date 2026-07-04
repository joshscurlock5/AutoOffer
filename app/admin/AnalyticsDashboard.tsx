"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AnalyticsData } from "@/lib/analyticsData";
import type { Profile, AdInsight, Ga4Traffic } from "@/lib/types";
import {
  computeView,
  filterProfiles,
  computeFilterOptions,
  segmentTable,
  SEGMENT_DIMENSIONS,
  type Filters,
  type SegmentDimension,
  type Count,
} from "@/lib/analyticsView";

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

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function HBars({ title, rows }: { title: string; rows: Count[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}</h3>
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

function Funnel({ rows }: { rows: Count[] }) {
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

function VBars({ title, rows }: { title: string; rows: { date: string; leads: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">{title}</h3>
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

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="card overflow-x-auto p-4">
      <h3 className="mb-3 text-sm font-bold text-navy">When leads arrive (day × hour, your time)</h3>
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
}: {
  rows: ReturnType<typeof segmentTable>;
  dim: SegmentDimension;
  setDim: (d: SegmentDimension) => void;
}) {
  return (
    <div className="card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-navy">Segment performance — how each group responds</h3>
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
            <th className="pl-2 text-right">Avg resp</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="py-3 text-muted">No data.</td></tr>
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

function ProfileRow({ p }: { p: Profile }) {
  const [open, setOpen] = useState(false);
  const a = p.attribution;
  const loc = [p.geo?.city, p.geo?.region, p.geo?.country].filter(Boolean).join(", ");
  return (
    <div className="card p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-navy">{p.name || p.emails[0] || p.phones[0] || "(no name)"}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STAGE_STYLE[p.stage] || "bg-slate-100 text-slate-600"}`}>{p.stage}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">via {p.source}</span>
            {p.device?.type && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">{p.device.type}</span>}
            {loc && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-muted">{loc}</span>}
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
            <div className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">On-site behavior</div>
            <Row k="Time on site" v={fmtDur(p.behavior?.timeOnSiteMs)} />
            <Row k="Pageviews" v={String(p.behavior?.pageviews ?? "—")} />
            <Row k="Furthest step" v={p.behavior?.maxFunnelStep ? `Step ${p.behavior.maxFunnelStep}` : "—"} />
            {p.offer && <Row k="Offer" v={`${money(p.offer.low)}–${money(p.offer.high)}`} />}
            {p.firstResponseMins != null && <Row k="Response time" v={fmtMins(p.firstResponseMins)} />}
            {p.appointmentAt && <Row k="Inspection" v={new Date(p.appointmentAt).toLocaleString("en-CA")} />}
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
            {p.leadIds.length > 0 && (
              <Link href="/admin" className="mt-2 inline-block text-xs font-semibold text-brand-600 hover:underline">Open in Leads →</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-bold text-navy">{title}</h2>
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
      const ps = profiles.filter((p) => (p.attribution?.utmCampaign || "") === ins.campaign);
      const leads = ps.filter((p) => p.stage !== "partial" && p.stage !== "spam").length;
      const revenue = ps.filter((p) => p.stage === "closed").reduce((s, p) => s + (p.purchasePrice || 0), 0);
      return { ...ins, leads, revenue, cpl: leads ? ins.spend / leads : null, roas: ins.spend ? revenue / ins.spend : null };
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
          <StatCard label="Ad spend" value={money(totalSpend)} />
          <StatCard label="Leads from ads" value={String(totalLeads)} />
          <StatCard label="Cost / lead" value={totalLeads ? money(totalSpend / totalLeads) : "—"} />
          <StatCard label="ROAS" value={totalSpend ? `${(totalRevenue / totalSpend).toFixed(1)}×` : "—"} sub={money(totalRevenue)} />
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
              <th className="py-2 pr-2">Campaign</th>
              <th className="px-2 text-right">Spend</th>
              <th className="px-2 text-right">Impr.</th>
              <th className="px-2 text-right">Clicks</th>
              <th className="px-2 text-right">CTR</th>
              <th className="px-2 text-right">Leads</th>
              <th className="px-2 text-right">Cost/lead</th>
              <th className="px-2 text-right">Revenue</th>
              <th className="pl-2 text-right">ROAS</th>
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
                  <td className="px-2 text-right font-semibold">{r.cpl != null ? money(r.cpl) : "—"}</td>
                  <td className="px-2 text-right">{r.revenue ? money(r.revenue) : "—"}</td>
                  <td className="pl-2 text-right">{r.roas != null ? `${r.roas.toFixed(1)}×` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Cost/lead + ROAS join ad spend to your leads by campaign — fills in as UTM-tagged ads bring in leads.</p>
      </div>
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
          <StatCard label="Visitors" value={n(t.totals.users)} />
          <StatCard label="New visitors" value={n(t.totals.newUsers)} />
          <StatCard label="Sessions" value={n(t.totals.sessions)} />
          <StatCard label="Pageviews" value={n(t.totals.pageviews)} />
          <StatCard label="Engagement" value={`${Math.round(t.totals.engagementRate * 100)}%`} />
        </div>
        <select className="field py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <VBars title="Visitors over time" rows={t.overTime.map((o) => ({ date: o.date, leads: o.users }))} />
        <HBars title="Traffic sources" rows={t.bySource.map((s) => ({ label: s.label, count: s.users }))} />
        <HBars title="By country" rows={t.byCountry.map((c) => ({ label: c.label, count: c.users }))} />
        <HBars title="By device" rows={t.byDevice.map((d) => ({ label: d.label, count: d.users }))} />
      </div>
    </div>
  );
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const { profiles, lookupsTotal } = data;
  const [filters, setFilters] = useState<Filters>({});
  const [dim, setDim] = useState<SegmentDimension>("source");
  const [q, setQ] = useState("");

  const options = useMemo(() => computeFilterOptions(profiles), [profiles]);
  const filtered = useMemo(() => filterProfiles(profiles, filters), [profiles, filters]);
  const view = useMemo(() => computeView(filtered), [filtered]);
  const segments = useMemo(() => segmentTable(filtered, dim), [filtered, dim]);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return filtered;
    return filtered.filter((p) =>
      [p.name, ...p.emails, ...p.phones, p.source, ...p.vehicles, p.attribution?.utmCampaign, p.geo?.city, p.geo?.region]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(n),
    );
  }, [q, filtered]);

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
        <StatCard label="People" value={String(view.totals.people)} />
        <StatCard label="Leads" value={String(view.totals.leads)} />
        <StatCard label="Abandoned" value={String(view.totals.partials)} sub="started, no submit" />
        <StatCard label="Lookups" value={String(lookupsTotal)} sub="all-time" />
        <StatCard label="Closed" value={String(view.totals.closed)} sub={money(view.totals.revenue)} />
        <StatCard label="Avg response" value={fmtMins(view.totals.avgResponseMins)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Funnel rows={view.funnel} />
        <VBars title="Leads over time" rows={view.overTime} />
      </div>

      <Section title="Segments — how different groups respond">
        <SegmentView rows={segments} dim={dim} setDim={setDim} />
      </Section>

      <Section title="Ad performance (Meta) — spend & cost-per-lead">
        <AdPerformance profiles={profiles} />
      </Section>

      <Section title="Traffic (GA4) — everyone who visited">
        <TrafficGa4 />
      </Section>

      <Section title="Geography">
        <div className="grid gap-4 lg:grid-cols-2">
          <HBars title="By country" rows={view.byCountry} />
          <HBars title="By province / region" rows={view.byRegion} />
        </div>
      </Section>

      <Section title="Acquisition">
        <div className="grid gap-4 lg:grid-cols-2">
          <HBars title="By source" rows={view.bySource} />
          <HBars title="By campaign" rows={view.byCampaign} />
        </div>
      </Section>

      <Section title="Behavior & mix">
        <div className="grid gap-4 lg:grid-cols-2">
          <HBars title="By device" rows={view.byDevice} />
          <HBars title="By vehicle make" rows={view.byMake} />
          <HBars title="By status" rows={view.byStatus} />
          <HBars title="By contact preference" rows={view.byContactMethod} />
        </div>
        <div className="mt-4">
          <Heatmap grid={view.heatmap} />
        </div>
      </Section>

      <Section title={`Profiles (${list.length})`}>
        <div className="mb-3">
          <input className="field max-w-xs" placeholder="Search name, phone, email, campaign, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="space-y-3">
          {list.length === 0 ? <p className="text-sm text-muted">No profiles match.</p> : list.map((p) => <ProfileRow key={p.id} p={p} />)}
        </div>
      </Section>
    </div>
  );
}
