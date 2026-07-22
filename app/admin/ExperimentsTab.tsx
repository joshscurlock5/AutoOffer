"use client";

import { useCallback, useEffect, useState } from "react";
import { EXPERIMENT_VARIANTS, SMS_SCENARIOS, type ExperimentVariant, type SmsScenario } from "@/lib/types";
import StageDemo, { STAGE_INFO, hasStageDemo } from "./StageDemos";

// Self-fetching A/B tab (same pattern as EmailsTab): pulls per-variant funnel +
// outcomes for the selected date range, and lets the owner set which variant is
// live (which drives BOTH the form and how new data is labeled).

interface VariantStats {
  // string (not the ExperimentVariant union) so the same card renders both the
  // contact-requirement variants and the SMS opt-in scenarios.
  key: string;
  label: string;
  funnel: { label: string; count: number }[];
  visitors: number;
  submitted: number;
  leads: number;
  booked: number;
  closed: number;
  visitorToLead: number | null;
  leadToBooked: number | null;
  leadToClosed: number | null;
}
interface ExpData {
  activeVariant: ExperimentVariant;
  smsScenario?: SmsScenario;
  variants: VariantStats[];
  /** Per-SMS-scenario funnels (no texting box vs Twilio box). */
  smsScenarios?: VariantStats[];
}

function FunnelBars({ funnel }: { funnel: { label: string; count: number }[] }) {
  const max = Math.max(1, ...funnel.map((f) => f.count));
  // Which stage's "what does this track?" demo is open (by label), if any.
  const [demo, setDemo] = useState<string | null>(null);
  const info = demo ? STAGE_INFO[demo] : undefined;
  return (
    <div className="space-y-1.5">
      {funnel.map((s, i) => {
        const prev = i > 0 ? funnel[i - 1].count : null;
        const drop = prev && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
        return (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="flex w-32 shrink-0 items-center gap-1 text-muted">
              <span className="truncate" title={s.label}>{s.label}</span>
              {hasStageDemo(s.label) && (
                <button
                  type="button"
                  onClick={() => setDemo(s.label)}
                  aria-label={`See what "${s.label}" tracks`}
                  className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-200 text-[9px] font-bold leading-none text-slate-500 hover:bg-brand-600 hover:text-white"
                >
                  i
                </button>
              )}
            </span>
            <div className="relative h-6 flex-1 overflow-hidden rounded bg-slate-100">
              <div className="h-full rounded bg-brand" style={{ width: `${(s.count / max) * 100}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right font-semibold text-navy">{s.count}</span>
            <span className="w-12 shrink-0 text-right text-xs text-red-500">
              {drop != null && drop > 0 ? `−${drop}%` : ""}
            </span>
          </div>
        );
      })}

      {/* Stage demo — a looping animation of the actual form stage + tracked action. */}
      {demo && info && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDemo(null)}
        >
          <div
            className="flex w-full max-w-[300px] flex-col items-center rounded-2xl bg-white p-5 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex w-full items-start justify-between gap-2">
              <div className="text-left">
                <div className="text-sm font-bold text-navy">{info.title}</div>
                <div className="text-xs text-muted">{info.blurb}</div>
              </div>
              <button
                type="button"
                onClick={() => setDemo(null)}
                aria-label="Close"
                className="-mr-1 -mt-1 shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="mt-3">
              <StageDemo stage={demo} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 text-center">
      <div className="text-lg font-bold text-navy">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
function Rate({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-slate-100 p-2 text-center">
      <div className="font-bold text-navy">{value == null ? "—" : `${value}%`}</div>
      <div className="text-muted">{label}</div>
    </div>
  );
}

function VariantCard({ v, active }: { v: VariantStats; active: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${active ? "border-brand-600 bg-brand-50/50" : "border-slate-200 bg-white"}`}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-bold text-navy">{v.label}</h3>
        {active && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">Live now</span>}
        <span className="ml-auto text-xs text-muted">{v.visitors.toLocaleString("en-CA")} visits</span>
      </div>
      <FunnelBars funnel={v.funnel} />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Tile label="Leads" value={v.leads} />
        <Tile label="Booked" value={v.booked} />
        <Tile label="Closed" value={v.closed} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <Rate label="Visit→Lead" value={v.visitorToLead} />
        <Rate label="Lead→Booked" value={v.leadToBooked} />
        <Rate label="Lead→Closed" value={v.leadToClosed} />
      </div>
    </div>
  );
}

export default function ExperimentsTab({ since, until }: { since?: string; until?: string }) {
  const [data, setData] = useState<ExpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ExperimentVariant | null>(null);
  const [savingSms, setSavingSms] = useState<SmsScenario | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (since) qs.set("since", since);
    if (until) qs.set("until", until);
    fetch(`/api/admin/experiments?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [since, until]);

  useEffect(() => { load(); }, [load]);

  async function setActive(variant: ExperimentVariant) {
    if (saving) return;
    setSaving(variant);
    try {
      const r = await fetch("/api/admin/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant }),
      });
      if (r.ok) setData((d) => (d ? { ...d, activeVariant: variant } : d));
    } catch {
      /* leave selection unchanged on failure */
    } finally {
      setSaving(null);
    }
  }

  async function setActiveSms(scenario: SmsScenario) {
    if (savingSms) return;
    setSavingSms(scenario);
    try {
      const r = await fetch("/api/admin/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsScenario: scenario }),
      });
      if (r.ok) setData((d) => (d ? { ...d, smsScenario: scenario } : d));
    } catch {
      /* leave selection unchanged on failure */
    } finally {
      setSavingSms(null);
    }
  }

  const active: ExperimentVariant = data?.activeVariant ?? "choose";
  const activeSms: SmsScenario = data?.smsScenario ?? "off";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-navy">A/B tests — contact requirements</h2>
        <p className="mt-1 text-sm text-muted">
          Compare how each version of the contact step converts. The version you pick below is what new
          visitors actually see AND how new leads/visits get labeled — so the comparison stays honest.
        </p>
      </div>

      {/* Live-variant selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Live version — what new visitors see &amp; what new data is saved under
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXPERIMENT_VARIANTS.map((m) => {
            const isActive = active === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActive(m.key)}
                disabled={saving != null}
                className={`rounded-lg border p-3 text-left transition ${isActive ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"} disabled:opacity-60`}
              >
                <div className="flex items-center gap-2">
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${isActive ? "border-brand-600 bg-brand-600" : "border-slate-300"}`}>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="font-semibold text-navy">{m.label}</span>
                  {isActive && (
                    <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {saving === m.key ? "Saving…" : "Live"}
                    </span>
                  )}
                </div>
                <p className="mt-1 pl-6 text-xs text-muted">{m.blurb}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-amber-700">
          Changing this switches the live form right away and starts saving new leads + visits under that
          version, until you switch again.
        </p>
      </div>

      {/* SMS opt-in A/B — separate switch: whether to show the Twilio consent box */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 text-sm font-bold text-navy">SMS opt-in box (Twilio)</div>
        <p className="mb-2 text-xs text-muted">
          Whether the get-offer form shows the text-message consent box. Keep it off until Twilio is
          approved — switching it on shows the box and starts collecting opt-ins right away.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SMS_SCENARIOS.map((m) => {
            const isActive = activeSms === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setActiveSms(m.key)}
                disabled={savingSms != null}
                className={`rounded-lg border p-3 text-left transition ${isActive ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50"} disabled:opacity-60`}
              >
                <div className="flex items-center gap-2">
                  <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${isActive ? "border-brand-600 bg-brand-600" : "border-slate-300"}`}>
                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="font-semibold text-navy">{m.label}</span>
                  {isActive && (
                    <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {savingSms === m.key ? "Saving…" : "Live"}
                    </span>
                  )}
                </div>
                <p className="mt-1 pl-6 text-xs text-muted">{m.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* SMS-scenario comparison — box vs no box, in the same spot as the toggle
          so the numbers sit right under the switch that drives them. All history
          with no SMS label counts under "No texting box" (the form since launch). */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(data?.smsScenarios ?? []).map((v) => (
            <VariantCard key={v.key} v={v} active={activeSms === v.key} />
          ))}
        </div>
      )}

      {/* Contact-requirement comparison */}
      <div className="pt-2">
        <h3 className="text-sm font-bold text-navy">Contact-requirement comparison</h3>
        <p className="mt-0.5 text-xs text-muted">How each contact-step version converts.</p>
      </div>
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(data?.variants ?? []).map((v) => (
            <VariantCard key={v.key} v={v} active={active === v.key} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        Funnel steps count website <strong>visits</strong> reaching each stage. Leads / Booked / Closed count
        actual <strong>lead records</strong> that came in during the selected date range — for very recent
        ranges their booked/closed outcomes may still be developing. Data with no version label predates the
        experiment and counts under “Choose either” (what the form has always been).
      </p>
    </div>
  );
}
