"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lead, LeadStatus, Referral } from "@/lib/types";
import { LEAD_STATUSES } from "@/lib/types";
import { cad, km as fmtKm, formatDateTime, timeAgo } from "@/lib/format";
import { site } from "@/lib/site-config";
import {
  Phone, Mail, Car, Trash, Search, Gift, Check, Camera,
} from "@/components/icons";

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Scheduled",
  paid: "Paid",
  lost: "Lost",
};

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-brand-50 text-brand",
  contacted: "bg-amber-50 text-amber-700",
  scheduled: "bg-purple-50 text-purple-700",
  paid: "bg-green-50 text-green-700",
  lost: "bg-slate-100 text-slate-500",
};

export default function AdminDashboard({
  initialLeads,
  initialReferrals,
}: {
  initialLeads: Lead[];
  initialReferrals: Referral[];
}) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [referrals, setReferrals] = useState<Referral[]>(initialReferrals);
  const [tab, setTab] = useState<"leads" | "referrals">("leads");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | LeadStatus>("all");

  const counts = useMemo(() => {
    return {
      total: leads.length,
      new: leads.filter((l) => l.status === "new").length,
      scheduled: leads.filter((l) => l.status === "scheduled").length,
      paid: leads.filter((l) => l.status === "paid").length,
    };
  }, [leads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter !== "all" && l.status !== filter) return false;
      if (!q) return true;
      const hay = [
        l.contact.name, l.contact.email, l.contact.phone,
        l.vehicle?.make, l.vehicle?.model, l.vehicle?.trim,
        String(l.vehicle?.year ?? ""), l.message, l.referralCode,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [leads, query, filter]);

  async function patchLead(id: string, patch: Partial<Lead>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await fetch("/api/admin/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "lead", id, patch }),
    });
  }

  async function removeLead(id: string) {
    if (!confirm("Delete this lead permanently?")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch("/api/admin/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function patchReferral(id: string, patch: Partial<Referral>) {
    setReferrals((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    await fetch("/api/admin/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "referral", id, patch }),
    });
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* top bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="container-x flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-extrabold text-navy">
              Auto<span className="text-brand">Offer</span>
            </span>
            <span className="rounded-full bg-navy px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
              Admin
            </span>
          </div>
          <button onClick={logout} className="text-sm font-semibold text-muted hover:text-brand">
            Sign out
          </button>
        </div>
      </div>

      <div className="container-x py-8">
        {/* stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total leads", value: counts.total },
            { label: "New", value: counts.new },
            { label: "Scheduled", value: counts.scheduled },
            { label: "Paid", value: counts.paid },
          ].map((s) => (
            <div key={s.label} className="card p-5">
              <div className="text-sm text-muted">{s.label}</div>
              <div className="mt-1 font-display text-3xl font-extrabold text-navy">{s.value}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div className="mt-8 flex items-center gap-2">
          <button
            onClick={() => setTab("leads")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "leads" ? "bg-navy text-white" : "bg-white text-navy hover:bg-slate-50"}`}
          >
            Leads ({leads.length})
          </button>
          <button
            onClick={() => setTab("referrals")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "referrals" ? "bg-navy text-white" : "bg-white text-navy hover:bg-slate-50"}`}
          >
            Referrals ({referrals.length})
          </button>
        </div>

        {tab === "leads" && (
          <>
            {/* controls */}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="field pl-9"
                  placeholder="Search name, car, phone…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["all", ...LEAD_STATUSES] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === s ? "bg-brand text-white" : "bg-white text-muted hover:text-navy"}`}
                  >
                    {s === "all" ? "All" : STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* list */}
            <div className="mt-5 space-y-4">
              {filtered.length === 0 && (
                <div className="card p-12 text-center text-muted">
                  No leads yet. New submissions will appear here automatically.
                </div>
              )}
              {filtered.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onPatch={patchLead}
                  onDelete={removeLead}
                />
              ))}
            </div>
          </>
        )}

        {tab === "referrals" && (
          <div className="mt-5 space-y-4">
            {referrals.length === 0 && (
              <div className="card p-12 text-center text-muted">No referrals yet.</div>
            )}
            {referrals.map((r) => (
              <div key={r.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-navy"><Gift className="h-5 w-5" /></span>
                      <div>
                        <div className="font-bold text-navy">{r.referrer.name}</div>
                        <div className="text-xs text-muted">{formatDateTime(r.createdAt)}</div>
                      </div>
                    </div>
                  </div>
                  <span className="rounded-lg bg-brand-50 px-3 py-1 font-mono text-sm font-bold text-brand">{r.code}</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="font-semibold text-navy">Referrer</div>
                    <a href={`mailto:${r.referrer.email}`} className="block text-muted hover:text-brand">{r.referrer.email}</a>
                    {r.referrer.phone && <a href={`tel:${r.referrer.phone}`} className="block font-semibold text-brand">{r.referrer.phone}</a>}
                  </div>
                  <div>
                    <div className="font-semibold text-navy">Friend</div>
                    <div className="text-muted">{r.friend.name || "—"}</div>
                    {r.friend.phone && <a href={`tel:${r.friend.phone}`} className="block font-semibold text-brand">{r.friend.phone}</a>}
                    {r.friend.email && <a href={`mailto:${r.friend.email}`} className="block text-muted hover:text-brand">{r.friend.email}</a>}
                  </div>
                </div>
                {r.message && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-muted">{r.message}</p>}
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm text-muted">Status:</span>
                  <select
                    className="field max-w-[180px] py-1.5 text-sm"
                    value={r.status}
                    onChange={(e) => patchReferral(r.id, { status: e.target.value as Referral["status"] })}
                  >
                    <option value="new">New</option>
                    <option value="qualified">Qualified</option>
                    <option value="paid">Paid ${site.referralReward}</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  onPatch,
  onDelete,
}: {
  lead: Lead;
  onPatch: (id: string, patch: Partial<Lead>) => void;
  onDelete: (id: string) => void;
}) {
  const [note, setNote] = useState(lead.notes || "");
  const noteChanged = note !== (lead.notes || "");
  const v = lead.vehicle;

  return (
    <div className="card overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[1fr_300px]">
        {/* main */}
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[lead.status]}`}>
              {STATUS_LABEL[lead.status]}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {lead.kind === "vehicle" ? "Vehicle offer" : "Inquiry"}
            </span>
            {lead.referralCode && (
              <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                Ref: {lead.referralCode}
              </span>
            )}
            <span className="ml-auto text-xs text-muted" title={formatDateTime(lead.createdAt)}>
              {timeAgo(lead.createdAt)}
            </span>
          </div>

          {v ? (
            <div className="mt-3 flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand"><Car className="h-6 w-6" /></span>
              <div>
                <div className="font-display text-lg font-bold text-navy">
                  {v.year} {v.make} {v.model} {v.trim || ""}
                </div>
                <div className="text-sm text-muted">
                  {fmtKm(v.mileageKm)}
                  {lead.estimate && !lead.estimate.unique && (
                    <> · Est. <span className="font-semibold text-navy">{cad(lead.estimate.low)} – {cad(lead.estimate.high)}</span></>
                  )}
                  {lead.estimate?.unique && <> · <span className="font-semibold text-amber-600">Unique — needs manual quote</span></>}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 font-display text-lg font-bold text-navy">General inquiry</div>
          )}

          {lead.message && (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-muted">{lead.message}</p>
          )}

          {/* contact */}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">Name</div>
              <div className="font-semibold text-navy">{lead.contact.name}</div>
            </div>
            <a href={`tel:${lead.contact.phone}`} className="group">
              <div className="text-xs uppercase tracking-wide text-muted">Phone</div>
              <div className="flex items-center gap-1.5 font-bold text-brand group-hover:underline">
                <Phone className="h-4 w-4" /> {lead.contact.phone}
              </div>
            </a>
            <a href={`mailto:${lead.contact.email}`} className="group min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted">Email</div>
              <div className="flex items-center gap-1.5 truncate text-navy group-hover:text-brand">
                <Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{lead.contact.email}</span>
              </div>
            </a>
          </div>

          {(lead.contact.contactMethod || lead.contact.bestTime) && (
            <p className="mt-2 text-xs text-muted">
              Prefers{" "}
              <span className="font-semibold capitalize text-navy">
                {lead.contact.contactMethod || "call"}
              </span>
              {lead.contact.bestTime ? ` · ${lead.contact.bestTime}` : ""}
            </p>
          )}

          {/* status + notes + actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <select
              className="field max-w-[170px] py-1.5 text-sm"
              value={lead.status}
              onChange={(e) => onPatch(lead.id, { status: e.target.value as LeadStatus })}
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <a href={`tel:${lead.contact.phone}`} className="btn-primary px-4 py-2 text-sm">
              <Phone className="h-4 w-4" /> Call
            </a>
            <button
              onClick={() => onDelete(lead.id)}
              className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete lead"
            >
              <Trash className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3">
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a customer note…"
              className="field resize-none text-sm"
            />
            {noteChanged && (
              <button
                onClick={() => onPatch(lead.id, { notes: note })}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                <Check className="h-4 w-4" /> Save note
              </button>
            )}
          </div>
        </div>

        {/* photos */}
        <div className="border-t border-slate-100 bg-slate-50 p-5 md:border-l md:border-t-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Camera className="h-4 w-4" /> Photos ({lead.photos.length})
          </div>
          {lead.photos.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {lead.photos.map((p) => (
                <a
                  key={p.file}
                  href={`/api/uploads/${lead.id}/${p.file}`}
                  target="_blank"
                  rel="noreferrer"
                  className="relative aspect-square overflow-hidden rounded-lg border border-slate-200"
                >
                  {/* shimmer shows until the photo finishes loading, then the
                      opaque image paints over it */}
                  <span className="skeleton absolute inset-0" aria-hidden />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/uploads/${lead.id}/${p.file}`}
                    alt={p.name}
                    className="relative h-full w-full object-cover transition hover:scale-105"
                  />
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">No photos submitted.</p>
          )}
        </div>
      </div>
    </div>
  );
}
