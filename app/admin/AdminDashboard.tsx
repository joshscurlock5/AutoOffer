"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lead, LeadStatus, Referral, UploadedPhoto, ChatConversation, Lookup } from "@/lib/types";
import { LEAD_STATUSES } from "@/lib/types";
import { cad, km as fmtKm, formatDateTime, timeAgo } from "@/lib/format";
import { site } from "@/lib/site-config";
import {
  Phone, Mail, Car, Trash, Search, Gift, Check, Camera, Star, X,
  ChevronLeft, ChevronRight, Dollar, Chat, Send, Activity, Database,
} from "@/components/icons";

type ChatSummary = {
  id: string;
  name: string | null;
  contact: string | null;
  updatedAt: string;
  lastSender: "visitor" | "admin";
  count: number;
  preview: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Scheduled",
  closed: "Closed",
  lost: "Lost",
  spam: "Spam",
};
const STATUS_STYLE: Record<string, string> = {
  new: "bg-brand-50 text-brand",
  contacted: "bg-amber-50 text-amber-700",
  scheduled: "bg-purple-50 text-purple-700",
  closed: "bg-green-50 text-green-700",
  lost: "bg-slate-100 text-slate-500",
  spam: "bg-red-50 text-red-600",
};
const labelOf = (s: string) => STATUS_LABEL[s] ?? s;
const styleOf = (s: string) => STATUS_STYLE[s] ?? "bg-slate-100 text-slate-500";

type LightboxState = { leadId: string; photos: UploadedPhoto[]; index: number };

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
  const [tab, setTab] = useState<"leads" | "referrals" | "chats" | "lookups">("leads");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "bookmarked" | "deleted" | "inventory" | LeadStatus>("all");
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [priceModal, setPriceModal] = useState<Lead | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatConversation | null>(null);
  const [lookups, setLookups] = useState<Lookup[]>([]);
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);
  const chatsNeedingReply = chats.filter((c) => c.lastSender === "visitor").length;

  const counts = useMemo(
    () => ({
      total: leads.filter((l) => l.status !== "spam" && !l.archived).length,
      new: leads.filter((l) => l.status === "new" && !l.archived).length,
      closed: leads.filter((l) => l.status === "closed" && !l.archived).length,
      saved: leads.filter((l) => l.bookmarked && !l.archived).length,
      deleted: leads.filter((l) => l.archived).length,
      // Bought (has a purchase price) but not yet sold — your current inventory.
      inventory: leads.filter(
        (l) => l.purchasePrice != null && l.actualSalePrice == null && !l.archived && l.status !== "spam",
      ).length,
    }),
    [leads],
  );

  // Inventory economics: cash tied up + estimated profit still on the lot.
  const inventoryLeads = useMemo(
    () =>
      leads.filter(
        (l) => l.purchasePrice != null && l.actualSalePrice == null && !l.archived && l.status !== "spam",
      ),
    [leads],
  );
  const invCash = inventoryLeads.reduce((s, l) => s + (l.purchasePrice || 0), 0);
  const invEstProfit = inventoryLeads.reduce(
    (s, l) => s + (l.expectedResale != null && l.purchasePrice != null ? l.expectedResale - l.purchasePrice : 0),
    0,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      // The Deleted view shows ONLY archived leads; every other view hides them.
      if (filter === "deleted") {
        if (!l.archived) return false;
      } else {
        if (l.archived) return false;
        if (filter === "all") {
          if (l.status === "spam") return false;
        } else if (filter === "bookmarked") {
          if (!l.bookmarked) return false;
        } else if (filter === "inventory") {
          if (!(l.purchasePrice != null && l.actualSalePrice == null && l.status !== "spam")) return false;
        } else if (l.status !== filter) {
          return false;
        }
      }
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

  // Soft delete: hide it everywhere + drop it from analytics, but keep it in the
  // Deleted tab for restore. patchLead flips the flag; `filtered` hides archived
  // from every non-Deleted view, so it simply vanishes from the current list.
  async function archiveLead(id: string) {
    if (!confirm("Move this lead to Deleted? It's hidden from your data, but you can restore it from the Deleted tab.")) return;
    await patchLead(id, { archived: true, archivedAt: new Date().toISOString() });
  }

  async function restoreLead(id: string) {
    await patchLead(id, { archived: false });
  }

  async function hardDeleteLead(id: string) {
    if (!confirm("Permanently delete this lead? This CANNOT be undone.")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch("/api/admin/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  // Changing status to "Closed" requires a purchase price first.
  function changeStatus(lead: Lead, status: LeadStatus) {
    if (status === "closed" && lead.purchasePrice == null) {
      setPriceModal(lead);
      return;
    }
    patchLead(lead.id, { status });
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

  async function refreshChats() {
    try {
      const r = await fetch("/api/admin/chats");
      const d = await r.json();
      if (Array.isArray(d.conversations)) setChats(d.conversations);
    } catch {
      /* ignore */
    }
  }

  async function refreshLookups() {
    try {
      const r = await fetch("/api/admin/lookups");
      const d = await r.json();
      if (Array.isArray(d.lookups)) setLookups(d.lookups);
    } catch {
      /* ignore */
    }
  }

  async function openChat(id: string) {
    try {
      const r = await fetch(`/api/admin/chats?conversationId=${encodeURIComponent(id)}`);
      const d = await r.json();
      if (d.conversation) setActiveChat(d.conversation);
    } catch {
      /* ignore */
    }
  }

  async function sendReply(text: string) {
    if (!activeChat || !text.trim()) return;
    try {
      const r = await fetch("/api/admin/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeChat.id, text: text.trim() }),
      });
      const d = await r.json();
      if (d.conversation) setActiveChat(d.conversation);
      refreshChats();
    } catch {
      /* ignore */
    }
  }

  // Poll the conversation list (keeps the Messages badge live).
  useEffect(() => {
    refreshChats();
    const t = setInterval(refreshChats, 8000);
    return () => clearInterval(t);
  }, []);

  // Load the API Calls log when that tab is open (and keep it fresh while there).
  useEffect(() => {
    if (tab !== "lookups") return;
    refreshLookups();
    const t = setInterval(refreshLookups, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Scroll to + briefly highlight a lead when clicked through from API Calls.
  useEffect(() => {
    if (!focusLeadId || tab !== "leads") return;
    document.getElementById(`lead-${focusLeadId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFocusLeadId(null), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLeadId, tab]);

  // Poll the open conversation for new visitor messages.
  useEffect(() => {
    if (!activeChat) return;
    const id = activeChat.id;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/chats?conversationId=${encodeURIComponent(id)}`);
        const d = await r.json();
        if (d.conversation) setActiveChat(d.conversation);
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.id]);

  // Lightbox keyboard controls
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowRight")
        setLightbox((lb) => (lb ? { ...lb, index: (lb.index + 1) % lb.photos.length } : lb));
      else if (e.key === "ArrowLeft")
        setLightbox((lb) => (lb ? { ...lb, index: (lb.index - 1 + lb.photos.length) % lb.photos.length } : lb));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const filterChips: ("all" | "bookmarked" | "inventory" | "deleted" | LeadStatus)[] = [
    "all", "bookmarked", "inventory", ...LEAD_STATUSES, "deleted",
  ];

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white">
        <div className="container-x flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-logo text-lg font-extrabold text-navy">
              Drive<span className="text-brand">Offer</span>
            </span>
            <span className="rounded-full bg-navy px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/admin/analytics"
              className="rounded-full bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Analytics
            </a>
            <button onClick={logout} className="text-sm font-semibold text-muted hover:text-brand">
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="container-x py-8">
        {/* stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Active leads", value: counts.total },
            { label: "New", value: counts.new },
            { label: "Closed", value: counts.closed },
            { label: "★ Saved", value: counts.saved },
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
          <button
            onClick={() => setTab("chats")}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "chats" ? "bg-navy text-white" : "bg-white text-navy hover:bg-slate-50"}`}
          >
            <Chat className="h-4 w-4" /> Messages
            {chatsNeedingReply > 0 && (
              <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">
                {chatsNeedingReply}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("lookups")}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === "lookups" ? "bg-navy text-white" : "bg-white text-navy hover:bg-slate-50"}`}
          >
            <Activity className="h-4 w-4" /> API Calls{lookups.length ? ` (${lookups.length})` : ""}
          </button>
        </div>

        {tab === "leads" && (
          <>
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
                {filterChips.map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === s ? "bg-brand text-white" : "bg-white text-muted hover:text-navy"}`}
                  >
                    {s === "all"
                      ? "All"
                      : s === "bookmarked"
                        ? "★ Saved"
                        : s === "inventory"
                          ? `🚗 Inventory${counts.inventory ? ` (${counts.inventory})` : ""}`
                          : s === "deleted"
                            ? `🗑 Deleted${counts.deleted ? ` (${counts.deleted})` : ""}`
                            : labelOf(s)}
                  </button>
                ))}
              </div>
            </div>

            {filter === "inventory" && inventoryLeads.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="text-xs text-muted">Vehicles held</div>
                  <div className="mt-1 font-display text-2xl font-extrabold text-navy">{inventoryLeads.length}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Cash in inventory</div>
                  <div className="mt-1 font-display text-2xl font-extrabold text-navy">{cad(invCash)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Est. profit (unsold)</div>
                  <div className={`mt-1 font-display text-2xl font-extrabold ${invEstProfit < 0 ? "text-red-600" : "text-green-700"}`}>
                    {cad(invEstProfit)}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-4">
              {filtered.length === 0 && (
                <div className="card p-12 text-center text-muted">
                  {filter === "inventory"
                    ? "No vehicles in inventory. Cars you've bought (add a “Bought for” price) show here until you record their sale price."
                    : filter === "deleted"
                      ? "Nothing deleted. Deleted leads land here and can be restored anytime."
                      : filter === "spam"
                        ? "No spam leads. Mark fake submissions as Spam to move them here."
                        : "No leads here yet. New submissions appear automatically."}
                </div>
              )}
              {filtered.map((lead) => (
                <div
                  key={lead.id}
                  id={`lead-${lead.id}`}
                  className={`rounded-2xl transition ${focusLeadId === lead.id ? "ring-2 ring-brand ring-offset-2" : ""}`}
                >
                  <LeadCard
                    lead={lead}
                    onPatch={patchLead}
                    onArchive={archiveLead}
                    onRestore={restoreLead}
                    onHardDelete={hardDeleteLead}
                    onStatusChange={changeStatus}
                    onToggleBookmark={(l) => patchLead(l.id, { bookmarked: !l.bookmarked })}
                    onOpenPhoto={(l, index) => setLightbox({ leadId: l.id, photos: l.photos, index })}
                  />
                </div>
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
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-navy"><Gift className="h-5 w-5" /></span>
                    <div>
                      <div className="font-bold text-navy">{r.referrer.name}</div>
                      <div className="text-xs text-muted">{formatDateTime(r.createdAt)}</div>
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

        {tab === "chats" && (
          <ChatsPanel chats={chats} active={activeChat} onOpen={openChat} onSend={sendReply} />
        )}

        {tab === "lookups" && (
          <LookupsPanel
            lookups={lookups}
            onOpenLead={(leadId) => {
              setTab("leads");
              setFilter("all");
              setQuery("");
              setFocusLeadId(leadId);
            }}
          />
        )}
      </div>

      {/* photo lightbox */}
      {lightbox && lightbox.photos.length > 0 && (
        <Lightbox state={lightbox} setState={setLightbox} onClose={() => setLightbox(null)} />
      )}

      {/* purchase-price prompt when closing a deal */}
      {priceModal && (
        <PriceModal
          lead={priceModal}
          onCancel={() => setPriceModal(null)}
          onConfirm={(price) => {
            patchLead(priceModal.id, { status: "closed", purchasePrice: price });
            setPriceModal(null);
          }}
        />
      )}
    </div>
  );
}

function PriceInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</label>
      <div className="relative mt-1">
        <Dollar className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          id={id}
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="field w-full py-1.5 pl-6 text-sm"
        />
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  onPatch,
  onArchive,
  onRestore,
  onHardDelete,
  onStatusChange,
  onToggleBookmark,
  onOpenPhoto,
}: {
  lead: Lead;
  onPatch: (id: string, patch: Partial<Lead>) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onHardDelete: (id: string) => void;
  onStatusChange: (lead: Lead, status: LeadStatus) => void;
  onToggleBookmark: (lead: Lead) => void;
  onOpenPhoto: (lead: Lead, index: number) => void;
}) {
  const [note, setNote] = useState(lead.notes || "");
  const [price, setPrice] = useState(lead.purchasePrice != null ? String(lead.purchasePrice) : "");
  const [resale, setResale] = useState(lead.expectedResale != null ? String(lead.expectedResale) : "");
  const [sold, setSold] = useState(lead.actualSalePrice != null ? String(lead.actualSalePrice) : "");
  const noteChanged = note !== (lead.notes || "");
  const toNum = (s: string): number | null => {
    const t = s.replace(/[^0-9.]/g, "");
    if (!t) return null;
    const n = Math.round(Number(t));
    return Number.isNaN(n) ? null : n;
  };
  const costV = toNum(price);
  const resaleV = toNum(resale);
  const soldV = toNum(sold);
  const dealChanged =
    (costV != null && costV !== (lead.purchasePrice ?? null)) ||
    (resaleV != null && resaleV !== (lead.expectedResale ?? null)) ||
    (soldV != null && soldV !== (lead.actualSalePrice ?? null));
  // Profit = actual sale (if recorded) else expected resale, minus your cost.
  const saleForProfit = soldV ?? lead.actualSalePrice ?? resaleV ?? lead.expectedResale ?? null;
  const costForProfit = costV ?? lead.purchasePrice ?? null;
  const isActualSale = (soldV ?? lead.actualSalePrice) != null;
  const profit = saleForProfit != null && costForProfit != null ? saleForProfit - costForProfit : null;
  const marginPct = profit != null && costForProfit ? Math.round((profit / costForProfit) * 100) : null;
  function saveDeal() {
    const patch: Partial<Lead> = {};
    if (costV != null && costV !== (lead.purchasePrice ?? null)) patch.purchasePrice = costV;
    if (resaleV != null && resaleV !== (lead.expectedResale ?? null)) patch.expectedResale = resaleV;
    if (soldV != null && soldV !== (lead.actualSalePrice ?? null)) {
      patch.actualSalePrice = soldV;
      if (lead.actualSalePrice == null) patch.soldAt = new Date().toISOString();
    }
    if (Object.keys(patch).length) onPatch(lead.id, patch);
  }
  const v = lead.vehicle;

  return (
    <div className="card overflow-hidden">
      <div className="grid gap-0 md:grid-cols-[1fr_300px]">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${styleOf(lead.status)}`}>
              {labelOf(lead.status)}
            </span>
            {lead.archived && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">Deleted</span>
            )}
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {lead.kind === "vehicle" ? "Vehicle offer" : "Inquiry"}
            </span>
            {lead.referralCode && (
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-700">
                Ref: {lead.referralCode}
              </span>
            )}
            {lead.purchasePrice != null && (
              <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-bold text-green-700">
                Bought {cad(lead.purchasePrice)}
              </span>
            )}
            {lead.actualSalePrice != null && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                Sold {cad(lead.actualSalePrice)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted" title={formatDateTime(lead.createdAt)}>
                {timeAgo(lead.createdAt)}
              </span>
              <button
                onClick={() => onToggleBookmark(lead)}
                aria-label={lead.bookmarked ? "Remove bookmark" : "Bookmark lead"}
                aria-pressed={!!lead.bookmarked}
                className="icon-btn h-8 w-8"
                title={lead.bookmarked ? "Saved" : "Save"}
              >
                <Star className={`h-5 w-5 ${lead.bookmarked ? "text-accent" : "text-slate-300 hover:text-accent/60"}`} />
              </button>
            </div>
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
                    <> · Est. <span className="font-semibold text-navy">{cad(lead.estimate.low)} – {cad(lead.estimate.high)}</span>
                      {lead.estimate.source === "market" ? (
                        <span className="ml-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                          Market{lead.estimate.comps != null ? ` · ${lead.estimate.comps} comps` : ""}
                        </span>
                      ) : (
                        <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Model est.</span>
                      )}
                    </>
                  )}
                  {lead.estimate?.unique && <> · <span className="font-semibold text-amber-600">Unique — needs manual quote</span></>}
                  {!lead.estimate && <> · <span className="font-semibold text-amber-600">Needs quote</span></>}
                </div>
                {v.condition && (v.condition.tags?.length || v.condition.note) ? (
                  <div className="mt-1 text-sm">
                    <span className="font-semibold text-navy">Condition: </span>
                    <span className="text-muted">
                      {[(v.condition.tags || []).join(", "), v.condition.note].filter(Boolean).join(" — ")}
                    </span>
                  </div>
                ) : null}
                {lead.appointmentAt ? (
                  <div className="mt-1 text-sm font-semibold text-brand-700">
                    📅 Inspection:{" "}
                    {new Date(lead.appointmentAt).toLocaleString("en-CA", {
                      timeZone: "America/Edmonton",
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {lead.appointmentConfirmedAt ? " ✅" : ""}
                    {lead.appointmentLocation ? (
                      <span className="font-normal text-muted"> · 📍 {lead.appointmentLocation}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-3 font-display text-lg font-bold text-navy">General inquiry</div>
          )}

          {lead.message && (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-muted">{lead.message}</p>
          )}

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
              <span className="font-semibold capitalize text-navy">{lead.contact.contactMethod || "call"}</span>
              {lead.contact.bestTime ? ` · ${lead.contact.bestTime}` : ""}
            </p>
          )}

          {/* status + actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <select
              className="field max-w-[170px] py-1.5 text-sm"
              value={lead.status}
              onChange={(e) => onStatusChange(lead, e.target.value as LeadStatus)}
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{labelOf(s)}</option>
              ))}
            </select>
            <a href={`tel:${lead.contact.phone}`} className="btn-primary px-4 py-2 text-sm">
              <Phone className="h-4 w-4" /> Call
            </a>
            {lead.archived ? (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => onRestore(lead.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-100"
                >
                  <Check className="h-4 w-4" /> Restore
                </button>
                <button
                  onClick={() => onHardDelete(lead.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash className="h-4 w-4" /> Delete forever
                </button>
              </div>
            ) : (
              <button
                onClick={() => onArchive(lead.id)}
                className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Delete lead"
                title="Delete (restorable from the Deleted tab)"
              >
                <Trash className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* deal economics — cost, expected resale, actual sale + live profit */}
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="grid grid-cols-3 gap-2">
              <PriceInput id={`cost-${lead.id}`} label="Bought for" value={price} onChange={setPrice} />
              <PriceInput id={`resale-${lead.id}`} label="Est. resale" value={resale} onChange={setResale} />
              <PriceInput id={`sold-${lead.id}`} label="Sold for" value={sold} onChange={setSold} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              {profit != null ? (
                <span className={`text-sm font-bold ${profit < 0 ? "text-red-600" : "text-green-700"}`}>
                  {isActualSale ? "Profit" : "Est. profit"}: {profit < 0 ? "−" : ""}{cad(Math.abs(profit))}
                  {marginPct != null && (
                    <span className="font-semibold text-muted"> ({profit >= 0 ? "+" : ""}{marginPct}%)</span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-muted">Add a cost + a resale or sale price to see profit.</span>
              )}
              {dealChanged && (
                <button
                  onClick={saveDeal}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  <Check className="h-4 w-4" /> Save
                </button>
              )}
            </div>
          </div>

          {/* notes */}
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
              {lead.photos.map((p, i) => (
                <button
                  key={p.file}
                  type="button"
                  onClick={() => onOpenPhoto(lead, i)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200"
                  aria-label={`View photo ${i + 1} of ${lead.photos.length}`}
                >
                  <span className="skeleton absolute inset-0" aria-hidden />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/uploads/${lead.id}/${p.file}`}
                    alt={p.name}
                    className="relative h-full w-full object-cover transition group-hover:scale-105"
                  />
                </button>
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

function Lightbox({
  state,
  setState,
  onClose,
}: {
  state: LightboxState;
  setState: (fn: (lb: LightboxState | null) => LightboxState | null) => void;
  onClose: () => void;
}) {
  const { leadId, photos, index } = state;
  const photo = photos[index];
  const go = (delta: number) =>
    setState((lb) => (lb ? { ...lb, index: (lb.index + delta + lb.photos.length) % lb.photos.length } : lb));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      {/* contained modal (~60% of the screen) so the image is never cut off */}
      <div
        className="flex max-h-[85vh] w-[90vw] max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="truncate text-sm font-medium text-navy">
            {index + 1} / {photos.length}
            <span className="ml-2 text-muted">{photo?.name}</span>
          </span>
          <button onClick={onClose} aria-label="Close" className="icon-btn h-9 w-9 text-muted hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative grid flex-1 place-items-center bg-slate-50 p-3">
          {photos.length > 1 && (
            <button
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-2 z-10 grid h-10 w-10 place-items-center rounded-full bg-white text-navy shadow-soft hover:bg-slate-100"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/uploads/${leadId}/${photo.file}`}
            alt={photo?.name || "Vehicle photo"}
            className="max-h-[60vh] max-w-full rounded-lg object-contain"
          />
          {photos.length > 1 && (
            <button
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-2 z-10 grid h-10 w-10 place-items-center rounded-full bg-white text-navy shadow-soft hover:bg-slate-100"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>

        {photos.length > 1 && (
          <div className="flex justify-center gap-2 overflow-x-auto border-t border-slate-100 p-3">
            {photos.map((p, i) => (
              <button
                key={p.file}
                onClick={() => setState((lb) => (lb ? { ...lb, index: i } : lb))}
                className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 ${i === index ? "border-brand" : "border-transparent opacity-60 hover:opacity-100"}`}
                aria-label={`Go to photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/uploads/${leadId}/${p.file}`} alt={p.name} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PriceModal({
  lead,
  onCancel,
  onConfirm,
}: {
  lead: Lead;
  onCancel: () => void;
  onConfirm: (price: number) => void;
}) {
  const [value, setValue] = useState("");
  const num = Math.round(Number(value.replace(/[^0-9.]/g, "")));
  const valid = value.trim() !== "" && !Number.isNaN(num) && num > 0;
  const v = lead.vehicle;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-sm p-6">
        <h3 className="font-display text-xl font-bold text-navy">Closing this deal</h3>
        <p className="mt-1 text-sm text-muted">
          How much did you buy{" "}
          <span className="font-semibold text-navy">
            {v ? `the ${v.year} ${v.make} ${v.model}` : "this vehicle"}
          </span>{" "}
          for?
        </p>
        <div className="relative mt-4">
          <Dollar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && valid) onConfirm(num); }}
            placeholder="e.g. 19000"
            className="field pl-8 text-lg"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={() => valid && onConfirm(num)}
            disabled={!valid}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Mark Closed
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatsPanel({
  chats,
  active,
  onOpen,
  onSend,
}: {
  chats: ChatSummary[];
  active: ChatConversation | null;
  onOpen: (id: string) => void;
  onSend: (text: string) => void;
}) {
  const [reply, setReply] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setReply(""), [active?.id]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages?.length]);

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* conversation list */}
      <div className="card max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
        {chats.length === 0 && (
          <div className="p-8 text-center text-sm text-muted">No messages yet.</div>
        )}
        {chats.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className={`flex w-full flex-col gap-1 p-4 text-left transition hover:bg-slate-50 ${active?.id === c.id ? "bg-brand-50" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-navy">{c.name || "Visitor"}</span>
              <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.updatedAt)}</span>
            </div>
            {c.contact && (
              <span className="flex items-center gap-1 truncate text-xs font-semibold text-brand">
                {c.contact.includes("@") ? <Mail className="h-3 w-3 shrink-0" /> : <Phone className="h-3 w-3 shrink-0" />}
                {c.contact}
              </span>
            )}
            <span className="truncate text-sm text-muted">{c.preview}</span>
            {c.lastSender === "visitor" && (
              <span className="w-fit rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Needs reply
              </span>
            )}
          </button>
        ))}
      </div>

      {/* thread */}
      <div className="card flex h-[34rem] flex-col overflow-hidden">
        {!active ? (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted">
            Select a conversation to read and reply.
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 px-4 py-3">
              <div>
                <span className="font-semibold text-navy">{active.name || "Visitor"}</span>
                <span className="ml-2 text-xs text-muted">{active.messages.length} messages</span>
              </div>
              {active.contact ? (
                <a
                  href={active.contact.includes("@") ? `mailto:${active.contact}` : `tel:${active.contact}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                >
                  {active.contact.includes("@") ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                  {active.contact}
                </a>
              ) : (
                <span className="mt-1 block text-xs text-muted">No contact info provided.</span>
              )}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
              {active.messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "admin" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                      m.role === "admin" ? "bg-brand text-white" : "bg-white text-navy shadow-soft"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) {
                  onSend(reply);
                  setReply("");
                }
              }}
              className="flex items-center gap-2 border-t border-slate-100 p-3"
            >
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply…"
                maxLength={2000}
                className="field flex-1 py-2"
              />
              <button type="submit" disabled={!reply.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                <Send className="h-4 w-4" /> Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function LookupsPanel({
  lookups,
  onOpenLead,
}: {
  lookups: Lookup[];
  onOpenLead: (leadId: string) => void;
}) {
  return (
    <div className="mt-5 space-y-3">
      <p className="text-sm text-muted">
        Every price lookup a visitor ran — the car they checked, the result shown, whether it used a
        live market-data call or a saved price, and whether they went on to share their contact info.
      </p>
      {lookups.length === 0 && (
        <div className="card p-12 text-center text-muted">
          No lookups yet. Each time someone checks a car&apos;s value, it appears here.
        </div>
      )}
      {lookups.map((lk) => (
        <LookupCard key={lk.id} lookup={lk} onOpenLead={onOpenLead} />
      ))}
    </div>
  );
}

function LookupCard({
  lookup,
  onOpenLead,
}: {
  lookup: Lookup;
  onOpenLead: (leadId: string) => void;
}) {
  const v = lookup.vehicle;
  const est = lookup.estimate;
  const priced = lookup.outcome === "priced" && est;

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Car className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold text-navy">
              {v.year} {v.make} {v.model} {v.trim || ""}
            </span>
            {lookup.apiCalls > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-bold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden />
                Live API call{lookup.apiCalls > 1 ? ` ×${lookup.apiCalls}` : ""}
              </span>
            ) : lookup.cached ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                <Database className="h-3 w-3" /> Saved price (no call)
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                No API call
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs text-muted" title={formatDateTime(lookup.createdAt)}>
              {timeAgo(lookup.createdAt)}
            </span>
          </div>

          <div className="mt-1 text-sm text-muted">
            {v.mileageKm ? `${fmtKm(v.mileageKm)} · ` : ""}
            {priced ? (
              <>
                Quoted{" "}
                <span className="font-semibold text-navy">
                  {cad(est.low)} – {cad(est.high)}
                </span>
                {est.source === "market" ? (
                  <span className="ml-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    Market{est.comps != null ? ` · ${est.comps} comps` : ""}
                  </span>
                ) : (
                  <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    Model est.
                  </span>
                )}
              </>
            ) : (
              <span className="font-semibold text-amber-600">
                No price shown — sent to the custom-offer form
              </span>
            )}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            {lookup.converted && lookup.leadId ? (
              <button
                onClick={() => onOpenLead(lookup.leadId!)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand hover:bg-brand-100"
              >
                <Check className="h-4 w-4" /> Filled out their info — view lead
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <span className="text-sm text-muted">Did not submit contact info.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
