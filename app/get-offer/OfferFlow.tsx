"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MAKES, YEARS, modelsFor } from "@/lib/vehicles";
import type { OfferEstimate, DecodedVehicle } from "@/lib/types";
import { cad, km as fmtKm } from "@/lib/format";
import { track, trackFunnel } from "@/lib/analytics";
import { trackMeta, newEventId } from "@/lib/metaPixel";
import { site } from "@/lib/site-config";
import PhoneButton from "@/components/PhoneButton";
import { OfferSkeleton } from "@/components/Skeleton";
import CountUp from "@/components/CountUp";
import WhySell from "@/components/WhySell";
import SecurePayment from "@/components/SecurePayment";
import CarBodyIllustration from "@/components/CarBodyIllustration";
import TurnstileBox, { turnstileEnabled } from "@/components/TurnstileBox";
import {
  ArrowRight, Check,
  Car, Lock,
} from "@/components/icons";

type Step = 1 | 2 | 3 | 4 | 5;
type InputMode = "manual" | "vin";
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
// The details step offers a single "No known issues" quick-select; anything else
// must be typed into the note so customers explain the specifics (a lone tag like
// "accident history" with no detail isn't useful). Selecting the chip and typing a
// note are mutually exclusive.
const DAMAGE_CLEAN = "No known issues";
const UNIQUE: OfferEstimate = { low: 0, high: 0, mid: 0, currency: "CAD", unique: true };
// Sentinel for an explicit "Not sure" trim pick — kept distinct from the blank
// placeholder so the <select> can show it, but normalized to "" before it's ever
// sent (estimate / lead) or displayed.
const TRIM_UNSURE = "__unsure__";

// The instant on-screen estimate is OFF — the MarketCheck prices were inaccurate,
// so every lead now goes straight to the "a specialist will contact you" contact
// form. ALL valuation code below is kept and gated on this flag so a future, more
// accurate API (e.g. Kelley Blue Book) can be wired into fetchEstimate and this
// flipped back to true. (Server side has a matching COMPUTE_ESTIMATE flag.)
const SHOW_INSTANT_ESTIMATE = false;

/** Live-format a phone number to (XXX) XXX-XXXX as the user types. */
function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function OfferFlow() {
  const sp = useSearchParams();
  // Which entry CTA sent the user here (stamped as ?source= by <OfferCtaLink/>).
  // Distinct from the widget/direct `source` dimension below — this is the
  // specific button, threaded through to generate_lead for full attribution.
  const ctaSource = sp.get("source") || "direct";
  // Arrived from the home form with a vehicle? Skip straight to the details step.
  const cameWithVehicle = Boolean(sp.get("year") && sp.get("make") && sp.get("model"));
  const [step, setStep] = useState<Step>(cameWithVehicle ? 2 : 1);
  const [inputMode, setInputMode] = useState<InputMode>(() => (sp.get("mode") === "vin" ? "vin" : "manual"));

  // vehicle (prefilled from the home-form query string)
  const [year, setYear] = useState(() => sp.get("year") || "");
  const [make, setMake] = useState(() => sp.get("make") || "");
  const [model, setModel] = useState(() => sp.get("model") || "");
  const [trim, setTrim] = useState(() => sp.get("trim") || "");
  const [kmv, setKmv] = useState(() => sp.get("km") || "");
  // Damage / condition (details step). Defaults to the clean "No known issues" chip.
  const [damageTags, setDamageTags] = useState<string[]>([DAMAGE_CLEAN]);
  const [damageNote, setDamageNote] = useState("");

  // VIN flow
  const [vin, setVin] = useState(() => (sp.get("vin") || "").toUpperCase());
  const [vinError, setVinError] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [decoded, setDecoded] = useState<DecodedVehicle | null>(null);

  // trims — loaded for the chosen year/make/model
  const [trims, setTrims] = useState<{ item: string; count: number }[]>([]);
  const [trimsLoading, setTrimsLoading] = useState(false);

  // contact
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactMethod, setContactMethod] = useState<"call" | "text" | "email">("call");
  const [bestTime, setBestTime] = useState("Anytime");
  const [tsToken, setTsToken] = useState("");

  const [estimate, setEstimate] = useState<OfferEstimate | null>(null);
  const [calculating, setCalculating] = useState(false);
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [step1Error, setStep1Error] = useState(false);

  // Funnel instrumentation guards (per-mount; reset on a fresh /get-offer load).
  const flowStarted = useRef(false);
  const estimateViews = useRef(0);
  const contactStarts = useRef(0);
  // First real interaction with the contact form (a keystroke in name/email/phone),
  // fired once per mount — the warm "started filling it out" signal, distinct from
  // contact_started (form merely shown). Does not re-fire after an editVehicle()
  // round-trip since the flow doesn't remount: one engagement per session.
  const contactEngaged = useRef(false);
  // Generic fire-once guard for the granular per-field funnel events.
  const fired = useRef<Set<string>>(new Set());
  // The id of the most recent /api/estimate lookup — sent with the lead so the
  // admin "API Calls" log can mark that lookup as converted.
  const lookupIdRef = useRef<string | null>(null);
  // Synchronous in-flight lock for the lead submit — stops a double-click from
  // firing a second request and a second, non-deduped Meta Lead before the
  // disabled state commits.
  const submittingRef = useRef(false);
  // Fire the abandoned-cart beacon at most once per session.
  const partialSentRef = useRef(false);

  // Load the real trims for the chosen year/make/model.
  useEffect(() => {
    if (!year || !make || !model) {
      setTrims([]);
      return;
    }
    let active = true;
    setTrimsLoading(true);
    fetch(`/api/trims?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${encodeURIComponent(year)}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setTrims(Array.isArray(d.trims) ? d.trims : []);
      })
      .catch(() => {
        if (active) setTrims([]);
      })
      .finally(() => {
        if (active) setTrimsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [year, make, model]);

  // Funnel start — fires for EVERY way into /get-offer.
  useEffect(() => {
    if (flowStarted.current) return;
    flowStarted.current = true;
    track("offer_flow_start", { source: sp.get("make") ? "widget" : "direct", cta_source: ctaSource });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any pending estimate-calc timer on unmount.
  useEffect(() => {
    return () => {
      if (calcTimer.current) clearTimeout(calcTimer.current);
    };
  }, []);

  // Restore in-progress fields so a refresh / accidental back-button
  // doesn't wipe what they typed. A deep-link that already carries a vehicle wins.
  useEffect(() => {
    if (cameWithVehicle) return;
    try {
      const s = JSON.parse(localStorage.getItem("ao_offer_progress") || "null");
      if (!s) return;
      if (s.year) setYear(s.year);
      if (s.make) setMake(s.make);
      if (s.model) setModel(s.model);
      if (s.trim) setTrim(s.trim);
      if (s.kmv) setKmv(s.kmv);
      if (Array.isArray(s.damageTags) && s.damageTags.length) setDamageTags(s.damageTags);
      if (s.damageNote) setDamageNote(s.damageNote);
      if (s.name) setName(s.name);
      if (s.email) setEmail(s.email);
      if (s.phone) setPhone(s.phone);
      if (s.contactMethod) setContactMethod(s.contactMethod);
      if (s.bestTime) setBestTime(s.bestTime);
      if (s.year && s.make && s.model) setStep(2);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist progress on every change; clear it once the lead is submitted.
  useEffect(() => {
    try {
      if (step === 5) {
        localStorage.removeItem("ao_offer_progress");
        return;
      }
      localStorage.setItem(
        "ao_offer_progress",
        JSON.stringify({ year, make, model, trim, kmv, damageTags, damageNote, name, email, phone, contactMethod, bestTime }),
      );
    } catch {
      /* ignore */
    }
  }, [year, make, model, trim, kmv, damageTags, damageNote, name, email, phone, contactMethod, bestTime, step]);

  const models = make ? modelsFor(make) : [];
  const vehicleValid = Boolean(year && make && model);
  const source = () => (sp.get("make") ? "widget" : "direct");

  const noKnownIssues = damageTags.includes(DAMAGE_CLEAN);

  // Toggle the single "No known issues" chip. Selecting it clears any typed note
  // (the two states are mutually exclusive).
  function toggleNoKnownIssues() {
    if (noKnownIssues) {
      setDamageTags([]);
    } else {
      setDamageTags([DAMAGE_CLEAN]);
      setDamageNote("");
    }
  }

  // Typing a note means there's something to note, so drop the clean selection.
  function onDamageNoteChange(v: string) {
    setDamageNote(v);
    if (v.trim().length > 0) setDamageTags((prev) => prev.filter((t) => t !== DAMAGE_CLEAN));
  }

  // Did the seller describe anything worth noting?
  const hasDamage = damageNote.trim().length > 0;

  /** Fire a granular per-field funnel event at most once per mount. */
  function once(event: string) {
    if (fired.current.has(event)) return;
    fired.current.add(event);
    track(event);
  }

  // Abandoned-cart capture: the instant a valid phone/email is typed on the contact
  // step, quietly beacon the already-typed data so we can recover the lead if they
  // leave without submitting. At most once per session; no UI, no new field.
  function sendPartialBeacon() {
    if (partialSentRef.current) return;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    const validPhone = phone.replace(/\D/g, "").length >= 10;
    if (!validEmail && !validPhone) return;
    partialSentRef.current = true;
    try {
      const payload = JSON.stringify({
        name,
        email,
        phone,
        contactMethod,
        year,
        make,
        model,
        trim: trim === TRIM_UNSURE ? "" : trim,
        mileageKm: kmv,
      });
      navigator.sendBeacon("/api/leads/partial", new Blob([payload], { type: "application/json" }));
      track("partial_captured", {});
    } catch {
      /* ignore — never disrupt the form */
    }
  }

  /** Fire contact_engaged (+ Meta InitiateCheckout) once on first real field interaction. */
  function markContactEngaged() {
    if (contactEngaged.current) return;
    contactEngaged.current = true;
    trackFunnel(
      "contact_engaged",
      { unique: !!estimate?.unique },
      { value: estimate?.mid ?? 0, currency: "CAD" },
    );
  }

  /** Fetch the real (market-based) estimate from the server. */
  async function fetchEstimate(y: string, mk: string, md: string, kmNum: number): Promise<OfferEstimate> {
    const res = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: y, make: mk, model: md, mileageKm: kmNum, trim: trim === TRIM_UNSURE ? "" : trim }),
    });
    if (!res.ok) throw new Error("estimate failed");
    const data = await res.json();
    lookupIdRef.current = typeof data.lookupId === "string" ? data.lookupId : null;
    return data.estimate as OfferEstimate;
  }

  function revealEstimate(est: OfferEstimate, ctx: { make: string; model: string; year: number }) {
    setEstimate(est);
    trackFunnel(
      "estimate_viewed",
      {
        make: ctx.make,
        model: ctx.model,
        year: ctx.year,
        unique: !!est.unique,
        source: est.source || "estimate",
        comps: est.comps ?? 0,
        reentry: estimateViews.current > 0,
      },
      // Meta ViewContent — the prime mid-funnel remarketing signal ("saw their value").
      { value: est.mid ?? 0, currency: "CAD", content_name: `${ctx.year} ${ctx.make} ${ctx.model}` },
    );
    estimateViews.current += 1;
    // Both paths (priced range + unique custom-offer) now show the contact form
    // inline on this same step, so the contact funnel begins right here.
    track("contact_started", { unique: !!est.unique, reentry: contactStarts.current > 0 });
    contactStarts.current += 1;
  }

  // STEP 1 (manual) -> details step.
  function goToDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleValid) {
      setStep1Error(true);
      const firstMissing = !year ? "year" : !make ? "make" : "model";
      track("form_error", { step: "vehicle", reason: `missing_${firstMissing}` });
      document.getElementById(firstMissing)?.focus();
      return;
    }
    track("step1_submitted", { make, model, year: Number(year), source: source() });
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // STEP 2 -> step 3. With the instant estimate off, this goes straight to the
  // contact form; with it on, it calculates and reveals the estimate.
  async function goToValue(e: React.FormEvent) {
    e.preventDefault();
    if (!kmv) {
      setError("Please add your mileage to continue.");
      track("form_error", { step: "details", reason: "missing_mileage" });
      document.getElementById("km")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("km")?.focus();
      return;
    }
    setError("");
    const yr = Number(year);
    track("details_submitted", { make, model, year: yr, hasDamage });
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (!SHOW_INSTANT_ESTIMATE) {
      // No on-screen estimate — the contact form shows immediately on step 3.
      track("contact_started", { unique: true, reentry: contactStarts.current > 0 });
      contactStarts.current += 1;
      return;
    }
    setCalculating(true);
    try {
      const est = await fetchEstimate(year, make, model, Number(kmv));
      revealEstimate(est, { make, model, year: yr });
    } catch {
      // The market lookup failed — we still show the custom-offer (unique) path,
      // but record the failure so it's not invisible in the funnel.
      track("estimate_error", { make, model, year: yr });
      revealEstimate(UNIQUE, { make, model, year: yr });
    } finally {
      setCalculating(false);
    }
  }

  // VIN path -> decode then confirm.
  async function decodeVin(e: React.FormEvent) {
    e.preventDefault();
    const v = vin.trim().toUpperCase();
    if (!VIN_RE.test(v)) {
      setVinError("Please enter a valid 17-character VIN (no spaces).");
      document.getElementById("vin")?.focus();
      return;
    }
    setVinError("");
    setDecoding(true);
    track("vin_submitted", {});
    try {
      const res = await fetch("/api/decode-vin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: v }),
      });
      const data = await res.json();
      if (!data.ok || !data.vehicle) {
        track("vin_failed", { reason: "decode_failed" });
        setVinError("We couldn't read that VIN. Double-check it, or switch to “Make & Model” above.");
        return;
      }
      setDecoded(data.vehicle as DecodedVehicle);
    } catch {
      track("vin_failed", { reason: "network" });
      setVinError("Something went wrong. Please try again, or enter your details manually.");
    } finally {
      setDecoding(false);
    }
  }

  function confirmDecoded() {
    if (!decoded) return;
    setYear(decoded.year ? String(decoded.year) : "");
    setMake(decoded.make || "");
    setModel(decoded.model || "");
    setTrim(decoded.trim || "");
    track("vin_confirmed", {});
    track("step1_submitted", {
      make: decoded.make || "",
      model: decoded.model || "",
      year: decoded.year || 0,
      source: "vin",
    });
    setDecoded(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function rejectDecoded() {
    if (decoded?.year) setYear(String(decoded.year));
    track("vin_rejected", {});
    setDecoded(null);
    setInputMode("manual");
  }

  function editVehicle() {
    track("edit_vehicle", { from_step: step });
    setInputMode("manual");
    setStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError("");
    if (contactMethod === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        track("form_error", { step: "contact", reason: "invalid_email" });
        setError("Please add a valid email address.");
        return;
      }
    } else if (phone.replace(/\D/g, "").length < 10) {
      track("form_error", { step: "contact", reason: "invalid_phone" });
      setError("Please add a 10-digit phone number.");
      return;
    }
    if (turnstileEnabled && !tsToken) {
      track("form_error", { step: "contact", reason: "missing_turnstile" });
      setError("Please complete the verification below, then submit.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    const metaEventId = newEventId();
    try {
      const fd = new FormData();
      fd.append("kind", "vehicle");
      fd.append("year", year);
      fd.append("make", make);
      fd.append("model", model);
      fd.append("trim", trim === TRIM_UNSURE ? "" : trim);
      fd.append("mileageKm", kmv);
      fd.append("name", name);
      fd.append("email", email);
      fd.append("phone", phone);
      fd.append("contactMethod", contactMethod);
      fd.append("bestTime", bestTime);
      if (estimate) fd.append("estimateJson", JSON.stringify(estimate));
      if (lookupIdRef.current) fd.append("lookupId", lookupIdRef.current);
      fd.append("metaEventId", metaEventId);
      if (tsToken) fd.append("turnstileToken", tsToken);
      fd.append("condition", JSON.stringify({ tags: damageTags, note: damageNote.trim() }));

      const res = await fetch("/api/leads", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Request failed");
      track("generate_lead", {
        currency: "CAD",
        value: estimate?.mid ?? 0,
        make,
        model,
        year: Number(year),
        contactMethod,
        unique: !!estimate?.unique,
        has_damage: hasDamage,
        cta_source: ctaSource,
      });
      trackMeta("Lead", { currency: "CAD", value: estimate?.mid ?? 0, content_name: `${year} ${make} ${model}` }, metaEventId);
      setStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      track("lead_error", { contactMethod });
      setError("Something went wrong submitting your request. Please try again or call us.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const isUnique = estimate?.unique;
  // "Not sure" → no trim, for anything user-facing or stored.
  const cleanTrim = trim === TRIM_UNSURE ? "" : trim;

  const damageBlock = (
    <div className="mt-6">
      <label className="label">
        Any damage worth noting? <span className="font-normal text-muted">(optional)</span>
      </label>
      <p className="-mt-1 mb-3 text-sm text-muted">
        All good? Tap &ldquo;No known issues.&rdquo; Otherwise, tell us what to note so we can prepare an accurate offer.
      </p>
      <button
        type="button"
        onClick={toggleNoKnownIssues}
        aria-pressed={noKnownIssues}
        className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
          noKnownIssues
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-slate-200 bg-white text-navy hover:border-brand-600"
        }`}
      >
        No known issues
      </button>
      <textarea
        id="damageNote"
        className="field mt-3 resize-none"
        rows={2}
        maxLength={500}
        value={damageNote}
        onChange={(e) => onDamageNoteChange(e.target.value)}
        placeholder="Anything else worth noting? (optional)"
      />
    </div>
  );

  // The shared contact form — rendered inline on both the priced and the unique
  // step. The screen header above it carries the per-path message.
  const renderContactForm = () => (
    <form onSubmit={submitLead} className="mt-6">
        <div className="space-y-4">
        <div>
          <span className="label">How should we reach you?</span>
          <div className="grid grid-cols-3 gap-2">
            {(["call", "text", "email"] as const).map((m) => {
              const active = contactMethod === m;
              const preferred = m === "call" || m === "text";
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setContactMethod(m)}
                  aria-pressed={active}
                  className={`flex w-full items-center justify-center gap-1 rounded-xl border px-1.5 py-2.5 text-sm font-semibold capitalize transition ${
                    active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : preferred
                        ? "border-brand-600/40 bg-brand-600/5 text-navy hover:border-brand-600"
                        : "border-slate-200 bg-white text-muted hover:border-brand-600"
                  }`}
                >
                  {m}
                  {m === "call" && (
                    <span
                      className={`whitespace-nowrap rounded-full px-1 py-0.5 text-[8px] font-bold uppercase leading-none ${
                        active ? "bg-white/25 text-white" : "bg-emerald-600 text-white"
                      }`}
                    >
                      ⚡ Fastest
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            Call or text is fastest — we can often give your offer on the spot.
          </p>
        </div>

        {contactMethod === "email" ? (
          <>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="field" value={email} onChange={(e) => { markContactEngaged(); if (e.target.value) once("contact_email_entered"); setEmail(e.target.value); }} onBlur={sendPartialBeacon} placeholder="you@email.com" autoComplete="email" />
              <p className="mt-1.5 text-xs text-muted">For your written offer and confirmation.</p>
            </div>
            <div>
              <label className="label" htmlFor="cphone">Mobile phone <span className="font-semibold text-emerald-700">(recommended)</span></label>
              <input id="cphone" type="tel" inputMode="numeric" maxLength={14} className="field" value={phone} onChange={(e) => { markContactEngaged(); if (e.target.value) once("contact_phone_entered"); setPhone(formatPhone(e.target.value)); }} onBlur={sendPartialBeacon} placeholder="(___) ___-____" autoComplete="tel" />
              <p className="mt-1.5 text-xs text-muted">Recommended — sometimes we need a quick detail to finalize an accurate offer, and a call or text is the fastest way to get it.</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="cphone">Mobile phone</label>
              <input id="cphone" type="tel" inputMode="numeric" maxLength={14} className="field" value={phone} onChange={(e) => { markContactEngaged(); if (e.target.value) once("contact_phone_entered"); setPhone(formatPhone(e.target.value)); }} onBlur={sendPartialBeacon} placeholder="(___) ___-____" autoComplete="tel" />
              <p className="mt-1.5 text-xs text-muted">Only used to send your offer — no spam, no robocalls.</p>
            </div>
            <div>
              <label className="label" htmlFor="email">Email <span className="font-normal text-muted">(optional)</span></label>
              <input id="email" type="email" className="field" value={email} onChange={(e) => { markContactEngaged(); if (e.target.value) once("contact_email_entered"); setEmail(e.target.value); }} onBlur={sendPartialBeacon} placeholder="you@email.com" autoComplete="email" />
              <p className="mt-1.5 text-xs text-muted">For your written offer and confirmation.</p>
            </div>
            <div>
              <label className="label" htmlFor="besttime">Best time to reach you <span className="font-normal text-muted">(optional)</span></label>
              <select id="besttime" className="field" value={bestTime} onChange={(e) => { once("contact_besttime_selected"); setBestTime(e.target.value); }}>
                <option>Anytime</option>
                <option>Morning</option>
                <option>Afternoon</option>
                <option>Evening</option>
              </select>
            </div>
          </>
        )}
        </div>

        <div className="mt-6 space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-center">
          <TurnstileBox onToken={setTsToken} />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full py-4 text-lg disabled:opacity-60">
          {submitting ? "Sending…" : "Get My Free Offer"}
          {!submitting && <ArrowRight className="h-5 w-5" />}
        </button>
        <div className="pt-1 text-center text-sm text-muted">
          <span className="inline-flex items-center gap-2">
            <Lock className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" /> Secure form. Your details are only used to prepare your offer.
          </span>
        </div>
        <p className="text-center text-[11px] leading-relaxed text-muted">
          By submitting, you agree DriveOffer may call, text, or email you about your offer —
          offer updates, reminders, and booking confirmations. Msg &amp; data rates may apply and
          message frequency varies. Reply STOP to opt out, HELP for help. See our{" "}
          <a href="/privacy" className="underline hover:text-navy">Privacy Policy</a> and{" "}
          <a href="/terms" className="underline hover:text-navy">Terms</a>.
        </p>
        </div>
      </form>
  );

  // Always 3 steps now — both the priced and the unique (custom-offer) paths
  // collect contact details inline on the same final step.
  const stepperLabels = ["Vehicle", "Details", "Contact"];

  return (
    <>
    <div className="container-x py-10 sm:py-14">
      {step < 5 && <Stepper step={step} labels={stepperLabels} />}

      {/* -------------------- STEP 1: vehicle (year / make / model) -------------------- */}
      {step === 1 && !decoded && (
        <div className="mt-8 animate-fade-up">
          <div className="card p-6 sm:p-9 lg:p-10">
            <h1 className="text-center font-display text-2xl font-bold text-navy sm:text-3xl">
              Tell us about your vehicle
            </h1>
            <p className="mt-2 text-center text-muted">
              {inputMode === "vin"
                ? "Enter your VIN and we'll pull up your exact vehicle — fastest and most accurate."
                : "Just your year, make and model to start — trim and mileage come next."}
            </p>

            {/* Mode toggle */}
            <div className="mt-6">
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setInputMode("manual")}
                  aria-pressed={inputMode === "manual"}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-base font-semibold transition ${inputMode === "manual" ? "bg-white text-navy shadow-soft" : "text-muted hover:text-navy"}`}
                >
                  Make &amp; Model
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("vin")}
                  aria-pressed={inputMode === "vin"}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-base font-semibold transition ${inputMode === "vin" ? "bg-white text-navy shadow-soft" : "text-muted hover:text-navy"}`}
                >
                  <Car className="h-4 w-4" /> Enter VIN <span className="hidden text-muted sm:inline">(faster)</span>
                </button>
              </div>
            </div>

            {inputMode === "vin" ? (
              <form onSubmit={decodeVin}>
                <div className="mt-6">
                  <label className="label" htmlFor="vin">VIN <span className="font-normal text-muted">(17 characters)</span></label>
                  <input
                    id="vin"
                    className="field font-mono uppercase tracking-wide"
                    value={vin}
                    onChange={(e) => { once("offer_form_start"); setVin(e.target.value.toUpperCase()); }}
                    placeholder="e.g. 1HGCM82633A004352"
                    maxLength={17}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    Find it on your registration, insurance card, or the driver-side dashboard / door jamb.
                  </p>
                </div>

                <button type="submit" disabled={decoding} className="btn-primary mt-8 w-full py-4 text-lg disabled:opacity-60">
                  {decoding ? "Looking up your VIN…" : <>Continue <ArrowRight className="h-5 w-5" /></>}
                </button>
                {vinError && (
                  <p role="alert" aria-live="polite" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">{vinError}</p>
                )}
              </form>
            ) : (
              <form onSubmit={goToDetails}>
                <div className="mt-6 grid grid-cols-1 gap-4">
                  <div>
                    <label className="label" htmlFor="year">Year</label>
                    <select id="year" className="field" value={year} onChange={(e) => { once("offer_form_start"); if (e.target.value) once("offer_year_selected"); setYear(e.target.value); }}>
                      <option value="">Select year</option>
                      {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="make">Make</label>
                    <select id="make" className="field" value={make} onChange={(e) => { once("offer_form_start"); if (e.target.value) once("offer_make_selected"); setMake(e.target.value); setModel(""); setTrim(""); }}>
                      <option value="">Select make</option>
                      {MAKES.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="model">Model</label>
                    <select
                      id="model"
                      className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      value={model}
                      disabled={!make}
                      onChange={(e) => { once("offer_form_start"); if (e.target.value) once("offer_model_selected"); setModel(e.target.value); setTrim(""); }}
                    >
                      <option value="">{make ? "Select model" : "Select a make first"}</option>
                      {models.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-8">
                  <button type="submit" className="btn-primary w-full py-4 text-lg">
                    Continue <ArrowRight className="h-5 w-5" />
                  </button>
                  {step1Error && !vehicleValid && (
                    <p role="alert" aria-live="polite" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">
                      Just pick your year, make, and model to continue.
                    </p>
                  )}
                </div>
              </form>
            )}

            <p className="mt-4 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-center text-base text-navy">
              <Lock className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" /> Secure form. Your details are only used to prepare your offer.
            </p>
          </div>
        </div>
      )}

      {/* -------------------- STEP 1b: confirm decoded VIN -------------------- */}
      {step === 1 && decoded && (
        <ConfirmCard decoded={decoded} onConfirm={confirmDecoded} onReject={rejectDecoded} />
      )}

      {/* -------------------- STEP 2: details (trim / mileage / condition) -------------------- */}
      {step === 2 && (
        <div className="mt-8 animate-fade-up">
          <VehicleSummary year={year} make={make} model={model} trim={cleanTrim} kmv={kmv} onEdit={editVehicle} />
          <div className="card mt-6 p-6 sm:p-9 lg:p-10">
            <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">
              Add a few details
            </h1>
            <p className="mt-2 text-muted">
              Trim, mileage and the car&apos;s condition help us put together your firm offer.
            </p>
            <form onSubmit={goToValue}>
              <div className="mt-6 grid grid-cols-1 gap-4">
                <div>
                  <label className="label" htmlFor="trim">Trim</label>
                  <select
                    id="trim"
                    className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    value={trim}
                    disabled={trimsLoading}
                    onChange={(e) => { if (e.target.value) once("details_trim_selected"); setTrim(e.target.value); }}
                  >
                    <option value="">{trimsLoading ? "Loading trims…" : "Select trim"}</option>
                    {[...trims].sort((a, b) => a.item.localeCompare(b.item)).map((t) => (
                      <option key={t.item} value={t.item}>{t.item}</option>
                    ))}
                    <option value={TRIM_UNSURE}>Not sure</option>
                  </select>
                  {!trimsLoading && trims.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted">No exact trim listed? Pick &ldquo;Not sure&rdquo; and we&apos;ll prepare a custom offer.</p>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="km">Mileage (km)</label>
                  <input id="km" type="number" inputMode="numeric" min={0} className="field" placeholder="e.g. 80000" value={kmv} onChange={(e) => { if (e.target.value) once("details_mileage_entered"); setKmv(e.target.value); }} />
                  <p className="mt-1.5 text-xs text-muted">A rough, approximate number is totally fine.</p>
                </div>
              </div>

              {damageBlock}

              <div className="mt-8">
                <button type="submit" className="btn-primary w-full py-4 text-lg">
                  Continue <ArrowRight className="h-5 w-5" />
                </button>
                {error && (
                  <p role="alert" aria-live="polite" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-600">{error}</p>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- STEP 3: contact (instant estimate off) -------------------- */}
      {step === 3 && (
        <div className="mt-8 animate-fade-up">
          {SHOW_INSTANT_ESTIMATE && calculating ? (
            <div className="animate-fade-up">
              <div className="mb-6 flex items-center justify-center gap-3 text-navy">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
                <span className="font-semibold">Calculating your value…</span>
              </div>
              <OfferSkeleton />
            </div>
          ) : !SHOW_INSTANT_ESTIMATE || !estimate || isUnique ? (
            <div className="animate-fade-up">
              <VehicleSummary year={year} make={make} model={model} trim={cleanTrim} kmv={kmv} onEdit={editVehicle} />
              <div className="card mt-6 p-6 sm:p-9 lg:p-10">
                <h1 className="font-display text-2xl font-bold text-navy">
                  Get your free offer
                </h1>
                <p className="mt-2 text-muted">
                  Please fill in your information and a specialist will contact you shortly.
                </p>
                {renderContactForm()}
              </div>
            </div>
          ) : (
            <div className="animate-fade-up">
              {/* Expanded (lg+): a single card — number | divider | vehicle (the original look).
                  Stacked (below lg): number plain on the page, vehicle in its own boxed pill. */}
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-8 lg:shadow-card">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted">Your offer</p>
                  <div className="mt-1 whitespace-nowrap font-display text-4xl font-extrabold text-emerald-700 sm:text-5xl">
                    <CountUp value={estimate.low} format={cad} /> –{" "}
                    <CountUp value={estimate.high} format={cad} />
                  </div>
                  {estimate.source === "market" && estimate.comps ? (
                    <p className="mt-2 text-sm font-medium text-muted">
                      Based on {estimate.comps.toLocaleString()} recent Canadian listings.
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-muted">
                    Priced from today&apos;s market — used-car values shift week to week, so it&apos;s worth locking in your offer soon.
                  </p>
                </div>

                <div className="hidden w-px self-stretch bg-slate-200 lg:block" />

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft sm:p-6 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:text-right">
                  <CarBodyIllustration make={make} model={model} className="mb-1 h-auto w-44 lg:ml-auto" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your vehicle</p>
                  <p className="font-display text-lg font-bold text-navy">
                    {year} {make} {model}{cleanTrim ? ` ${cleanTrim}` : ""}
                  </p>
                  {kmv && <p className="mt-0.5 text-sm text-muted">{fmtKm(Number(kmv))}</p>}
                  <button onClick={editVehicle} className="mt-2 text-sm font-medium text-muted hover:text-brand-700">
                    ← Edit vehicle details
                  </button>
                </div>
              </div>

              {/* Contact — merged into this step so a priced car is a single screen. */}
              <div className="card mt-6 p-6 sm:p-9 lg:p-10">
                <h2 className="font-display text-xl font-bold text-navy sm:text-2xl">
                  We&apos;ll confirm a firm offer for your {make} {model} after a few quick details.
                </h2>
                {renderContactForm()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------- STEP 5: success -------------------- */}
      {step === 5 && (
        <div className="mx-auto mt-10 max-w-xl animate-fade-up text-center">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-slate-100 text-navy">
            <Check className="h-10 w-10" />
          </span>
          <h1 className="mt-6 font-display text-3xl font-extrabold text-navy">
            Thanks — we got it!
          </h1>
          <p className="mt-3 text-lg text-muted">
            {email.trim()
              ? "Check your email for a confirmation. Here's what happens next:"
              : `We'll ${contactMethod === "text" ? "text" : "call"} you shortly${phone ? ` at ${phone}` : ""}. Here's what happens next:`}
          </p>
          <ol className="mx-auto mt-5 max-w-md space-y-2.5 text-left text-sm text-navy">
            <li className="flex gap-2.5">
              <span className="font-bold text-brand">1.</span>
              <span>We review your {year} {make} {model} and reach out by <span className="font-semibold capitalize">{contactMethod}</span> with your firm offer — as soon as possible (we&apos;re available 24/7).</span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-bold text-brand">2.</span>
              <span>We arrange a quick inspection at a time and place that works for you.</span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-bold text-brand">3.</span>
              <span>You get paid on the spot — e-transfer or bank draft before we take the keys.</span>
            </li>
          </ol>
          <div className="mt-8 rounded-2xl bg-slate-50 p-6 text-center">
            <p className="font-semibold text-navy">Want it faster? Call or text us now.</p>
            <p className="mt-1 text-sm text-muted">
              Skip the wait — our team can finalize your offer right over the phone.
            </p>
            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <PhoneButton variant="primary" location="offer_success" />
              <Link href="/" className="btn-ghost">Back to home</Link>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-accent/40 bg-accent/10 p-6 text-center">
            <p className="font-semibold text-navy">Know someone else selling their car?</p>
            <p className="mt-1 text-sm text-muted">
              Refer a friend and you each get ${site.referralReward} when they sell to {site.name}.
            </p>
            <Link href="/referral" onClick={() => track("referral_cta_click", { location: "offer_success" })} className="btn-primary mt-4 inline-flex px-5 py-2.5 text-sm">
              Refer a friend &amp; earn ${site.referralReward}
            </Link>
          </div>
        </div>
      )}
    </div>

    {/* Trust sections shown beneath the form on every step (1–3), but not on the
        success screen (step 5) which has its own call-to-action. */}
    {step < 5 && (
      <>
        <WhySell />
        <SecurePayment showCta={false} />
      </>
    )}
    </>
  );
}

function Stepper({ step, labels }: { step: Step; labels: string[] }) {
  return (
    <ol className="mx-auto flex max-w-2xl items-center">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step >= n;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition ${
                  active ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"
                }`}
              >
                {step > n ? <Check className="h-4 w-4" /> : n}
              </span>
              <span className={`hidden text-sm font-semibold sm:block ${active ? "text-navy" : "text-slate-400"}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <span className={`mx-3 h-0.5 flex-1 rounded ${step > n ? "bg-brand-600" : "bg-slate-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function VehicleSummary({
  year, make, model, trim, kmv, onEdit,
}: {
  year: string;
  make: string;
  model: string;
  trim: string;
  kmv: string;
  onEdit: () => void;
}) {
  const sub = [trim, kmv ? fmtKm(Number(kmv)) : ""].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-28 shrink-0 place-items-center">
          <CarBodyIllustration make={make} model={model} className="h-auto w-28" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your vehicle</p>
          <p className="font-display text-lg font-bold text-navy sm:text-xl">
            {year} {make} {model}
          </p>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-brand hover:text-brand-700"
      >
        Edit
      </button>
    </div>
  );
}

function ConfirmCard({
  decoded,
  onConfirm,
  onReject,
}: {
  decoded: DecodedVehicle;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const label = [decoded.year, decoded.make, decoded.model, decoded.trim].filter(Boolean).join(" ");
  const details = [decoded.bodyType, decoded.drivetrain, decoded.transmission].filter(Boolean).join(" · ");
  return (
    <div className="card mx-auto mt-8 max-w-xl animate-fade-up p-6 text-center sm:p-9">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-navy">
        <Car className="h-7 w-7" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-navy">Is this your vehicle?</h1>
      <p className="mt-2 text-muted">We decoded your VIN as:</p>
      <p className="mt-3 font-display text-2xl font-extrabold text-navy">{label || "Unknown vehicle"}</p>
      {details && <p className="mt-1 text-sm text-muted">{details}</p>}
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <button onClick={onConfirm} className="btn-primary">
          Yes, that&apos;s my car <ArrowRight className="h-4 w-4" />
        </button>
        <button onClick={onReject} className="btn border-2 border-slate-200 bg-white text-navy hover:border-navy">
          No, enter details manually
        </button>
      </div>
    </div>
  );
}