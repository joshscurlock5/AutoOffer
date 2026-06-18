"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MAKES, YEARS, modelsFor } from "@/lib/vehicles";
import type { OfferEstimate, DecodedVehicle } from "@/lib/types";
import { cad, km as fmtKm } from "@/lib/format";
import { track } from "@/lib/analytics";
import { site, telHref } from "@/lib/site-config";
import OfferGauge from "@/components/OfferGauge";
import PhoneButton from "@/components/PhoneButton";
import { OfferSkeleton } from "@/components/Skeleton";
import CountUp from "@/components/CountUp";
import {
  ArrowRight, Phone, Check, Camera, Trash, Calendar, Dollar,
  Send, Shield, Car,
} from "@/components/icons";

type Step = 1 | 2 | 3 | 4;
type InputMode = "manual" | "vin";
const MAX_PHOTOS = 12;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const UNIQUE: OfferEstimate = { low: 0, high: 0, mid: 0, currency: "CAD", unique: true };

/** Live-format a phone number to (XXX) XXX-XXXX as the user types. */
function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function OfferFlow() {
  const sp = useSearchParams();
  // Did we arrive from the home form with a complete vehicle? If so we show a
  // summary card (with Edit) instead of re-asking for everything.
  const cameFromWidget = Boolean(sp.get("year") && sp.get("make") && sp.get("model") && sp.get("km"));
  const [step, setStep] = useState<Step>(1);
  const [inputMode, setInputMode] = useState<InputMode>(() => (sp.get("mode") === "vin" ? "vin" : "manual"));
  const [editing, setEditing] = useState(false);

  // vehicle (prefilled from the home-form query string)
  const [year, setYear] = useState(() => sp.get("year") || "");
  const [make, setMake] = useState(() => sp.get("make") || "");
  const [model, setModel] = useState(() => sp.get("model") || "");
  const [trim, setTrim] = useState(() => sp.get("trim") || "");
  const [kmv, setKmv] = useState(() => sp.get("km") || "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  // VIN flow
  const [vin, setVin] = useState(() => (sp.get("vin") || "").toUpperCase());
  const [vinError, setVinError] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [decoded, setDecoded] = useState<DecodedVehicle | null>(null);
  const [pendingEstimate, setPendingEstimate] = useState<OfferEstimate | null>(null);

  // trims (manual mode) — loaded for the chosen year/make/model
  const [trims, setTrims] = useState<{ item: string; count: number }[]>([]);
  const [trimsLoading, setTrimsLoading] = useState(false);

  // contact
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactMethod, setContactMethod] = useState<"call" | "text" | "email">("call");
  const [bestTime, setBestTime] = useState("Anytime");

  const [estimate, setEstimate] = useState<OfferEstimate | null>(null);
  const [calculating, setCalculating] = useState(false);
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Funnel instrumentation guards (per-mount; reset on a fresh /get-offer load).
  const flowStarted = useRef(false);
  const estimateViews = useRef(0);
  const contactStarts = useRef(0);

  // (Prefill comes from the query string via the useState initializers above.)

  // Load the real trims for the chosen year/make/model (manual entry only).
  useEffect(() => {
    if (inputMode !== "manual" || !year || !make || !model || (cameFromWidget && !editing)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, year, make, model, cameFromWidget, editing]);

  // Funnel start — fires for EVERY way into /get-offer (homepage widget OR a
  // direct entry via header/sticky/exit/footer), so step-1 bounce is visible.
  useEffect(() => {
    if (flowStarted.current) return;
    flowStarted.current = true;
    track("offer_flow_start", { source: sp.get("make") ? "widget" : "direct" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke object URLs only on unmount (a [previews] dependency would revoke
  // URLs that are still being displayed).
  const previewsRef = useRef<string[]>([]);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  useEffect(() => {
    return () => {
      previewsRef.current.forEach((u) => URL.revokeObjectURL(u));
      if (calcTimer.current) clearTimeout(calcTimer.current);
    };
  }, []);

  const models = make ? modelsFor(make) : [];
  const step1Valid = Boolean(year && make && model && kmv);
  const vinValid = VIN_RE.test(vin.trim().toUpperCase()) && Boolean(kmv);
  // Manual + arrived complete + not actively editing -> show the summary card.
  const showSummary = inputMode === "manual" && cameFromWidget && !editing;
  const source = () => (sp.get("make") ? "widget" : "direct");

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - photos.length;
    const accepted = incoming.slice(0, Math.max(0, room));
    if (!accepted.length) return;
    setPhotos((p) => [...p, ...accepted]);
    setPreviews((p) => [...p, ...accepted.map((f) => URL.createObjectURL(f))]);
  }

  function removePhoto(i: number) {
    URL.revokeObjectURL(previews[i]);
    setPhotos((p) => p.filter((_, idx) => idx !== i));
    setPreviews((p) => p.filter((_, idx) => idx !== i));
  }

  /** Fetch the real (market-based) estimate from the server. */
  async function fetchEstimate(y: string, mk: string, md: string, kmNum: number): Promise<OfferEstimate> {
    const res = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: y, make: mk, model: md, mileageKm: kmNum, trim }),
    });
    if (!res.ok) throw new Error("estimate failed");
    const data = await res.json();
    return data.estimate as OfferEstimate;
  }

  function revealEstimate(est: OfferEstimate, ctx: { make: string; model: string; year: number }) {
    setEstimate(est);
    track("estimate_viewed", {
      make: ctx.make,
      model: ctx.model,
      year: ctx.year,
      unique: !!est.unique,
      source: est.source || "estimate",
      comps: est.comps ?? 0,
      reentry: estimateViews.current > 0,
    });
    estimateViews.current += 1;
  }

  // MANUAL path -> real estimate.
  async function goToOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!step1Valid) return;
    const yr = Number(year);
    const kmNum = Number(kmv);
    setError("");
    track("step1_submitted", { make, model, year: yr, source: source() });
    setStep(2);
    setCalculating(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const est = await fetchEstimate(year, make, model, kmNum);
      revealEstimate(est, { make, model, year: yr });
    } catch {
      // Network hiccup — route to the human "custom offer" flow, never a guess.
      revealEstimate(UNIQUE, { make, model, year: yr });
    } finally {
      setCalculating(false);
    }
  }

  // VIN path -> decode (+ estimate) then confirm.
  async function decodeAndEstimate(e: React.FormEvent) {
    e.preventDefault();
    const v = vin.trim().toUpperCase();
    if (!VIN_RE.test(v)) {
      setVinError("Please enter a valid 17-character VIN (no spaces).");
      return;
    }
    if (!kmv) {
      setVinError("Please add your mileage (km).");
      return;
    }
    setVinError("");
    setDecoding(true);
    track("vin_submitted", {});
    try {
      const res = await fetch("/api/decode-vin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: v, mileageKm: Number(kmv) }),
      });
      const data = await res.json();
      if (!data.ok || !data.vehicle) {
        setVinError("We couldn't read that VIN. Double-check it, or switch to “Enter details” above.");
        return;
      }
      setDecoded(data.vehicle as DecodedVehicle);
      setPendingEstimate((data.estimate as OfferEstimate) || null);
    } catch {
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
    const est = pendingEstimate || UNIQUE;
    setDecoded(null);
    setStep(2);
    setCalculating(true);
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(() => setCalculating(false), 500);
    revealEstimate(est, {
      make: decoded.make || "",
      model: decoded.model || "",
      year: decoded.year || 0,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function rejectDecoded() {
    if (decoded?.year) setYear(String(decoded.year));
    track("vin_rejected", {});
    setDecoded(null);
    setPendingEstimate(null);
    setInputMode("manual");
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please add your first name.");
      return;
    }
    if (contactMethod === "email") {
      if (!email.trim()) {
        setError("You chose email — please add your email address.");
        return;
      }
    } else if (phone.replace(/\D/g, "").length < 10) {
      setError(`You chose ${contactMethod} — please add a 10-digit phone number.`);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("kind", "vehicle");
      fd.append("year", year);
      fd.append("make", make);
      fd.append("model", model);
      fd.append("trim", trim);
      fd.append("mileageKm", kmv);
      fd.append("name", name);
      fd.append("email", email);
      fd.append("phone", phone);
      fd.append("contactMethod", contactMethod);
      fd.append("bestTime", bestTime);
      // The estimate the customer was shown — stored only if the server can't re-price.
      if (estimate) fd.append("estimateJson", JSON.stringify(estimate));
      photos.forEach((f) => fd.append("photos", f));

      const res = await fetch("/api/leads", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Request failed");
      // GA4 recommended lead event — value/currency let it import as an Ads conversion.
      track("generate_lead", {
        currency: "CAD",
        value: estimate?.mid ?? 0,
        make,
        model,
        year: Number(year),
        contactMethod,
        unique: !!estimate?.unique,
      });
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      track("lead_error", { contactMethod });
      setError(
        "Something went wrong submitting your request. Please try again or call us.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Advance to the contact step from EITHER the priced or unique branch.
  function advanceToContact() {
    track("contact_started", { unique: !!estimate?.unique, reentry: contactStarts.current > 0 });
    contactStarts.current += 1;
    setStep(3);
  }

  const isUnique = estimate?.unique;

  const photoBlock = (
    <div className="mt-6">
      <label className="label">
        Photos <span className="font-normal text-muted">(optional)</span>
      </label>
      <p className="-mt-1 mb-2 text-sm text-muted">
        Photos are optional, but they help us make a firmer offer faster. No car nearby? You can add them later.
      </p>
      <label
        htmlFor="photos"
        className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center transition hover:border-brand hover:bg-brand-50"
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-white">
          <Camera className="h-6 w-6" />
        </span>
        <span className="mt-3 font-semibold text-navy">Add photos of your car</span>
        <span className="mt-1 text-sm text-muted">
          Front, back, sides, interior &amp; odometer work best. Up to {MAX_PHOTOS} photos.
        </span>
        <input
          id="photos"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }}
        />
      </label>

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {previews.map((src, i) => (
            <div key={src} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Vehicle photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                aria-label="Remove photo"
              >
                <Trash className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const callLine = (
    <p className="text-sm text-muted">
      Prefer to talk? Call{" "}
      <a href={telHref} onClick={() => track("phone_click", { location: "offer_step1" })} className="font-bold text-brand hover:underline">{site.phoneDisplay}</a>
    </p>
  );

  return (
    <div className="container-x max-w-4xl py-10 sm:py-14">
      {step < 4 && <Stepper step={step} />}

      {/* -------------------- STEP 1: vehicle details -------------------- */}
      {step === 1 && !decoded && (
        <div className="card mt-8 animate-fade-up p-6 sm:p-9">
          {showSummary ? (
            <>
              <h1 className="text-center font-display text-2xl font-bold text-navy sm:text-3xl">
                You&apos;re almost there
              </h1>
              <p className="mt-2 text-center text-muted">
                Here&apos;s your vehicle. Add a few photos if you&apos;d like — then see your estimate.
              </p>
              <form onSubmit={goToOffer}>
                <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                      <Car className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your vehicle</p>
                      <p className="font-display text-lg font-bold text-navy sm:text-xl">
                        {year} {make} {model}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {trim ? `${trim} · ` : ""}{fmtKm(Number(kmv))}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-brand hover:text-brand"
                  >
                    Edit
                  </button>
                </div>

                {photoBlock}

                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                  {callLine}
                  <button type="submit" disabled={!step1Valid} className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50">
                    See My Estimate <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-center font-display text-2xl font-bold text-navy sm:text-3xl">
                Tell us about your vehicle
              </h1>
          <p className="mt-2 text-center text-muted">
            {inputMode === "vin"
              ? "Enter your VIN and we'll pull up your exact vehicle — fastest and most accurate."
              : "Just the basics — year, make, model and mileage. Everything else is optional."}
          </p>

          {/* Mode toggle */}
          <div className="mt-5 flex justify-center">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setInputMode("manual")}
              aria-pressed={inputMode === "manual"}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${inputMode === "manual" ? "bg-white text-navy shadow-soft" : "text-muted hover:text-navy"}`}
            >
              Enter details
            </button>
            <button
              type="button"
              onClick={() => setInputMode("vin")}
              aria-pressed={inputMode === "vin"}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${inputMode === "vin" ? "bg-white text-navy shadow-soft" : "text-muted hover:text-navy"}`}
            >
              <Car className="h-4 w-4" /> Enter VIN <span className="text-brand">(faster)</span>
            </button>
            </div>
          </div>

          {inputMode === "vin" ? (
            <form onSubmit={decodeAndEstimate}>
              <div className="mt-6 grid gap-4">
                <div>
                  <label className="label" htmlFor="vin">VIN <span className="font-normal text-muted">(17 characters)</span></label>
                  <input
                    id="vin"
                    className="field font-mono uppercase tracking-wide"
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
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
                <div>
                  <label className="label" htmlFor="vkm">Mileage (km)</label>
                  <input id="vkm" type="number" inputMode="numeric" min={0} className="field" placeholder="e.g. 80000" value={kmv} onChange={(e) => setKmv(e.target.value)} />
                  <p className="mt-1.5 text-xs text-muted">A rough, approximate number is totally fine.</p>
                </div>
              </div>

              {photoBlock}

              {vinError && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{vinError}</p>}

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                {callLine}
                <button type="submit" disabled={decoding || !vinValid} className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50">
                  {decoding ? "Looking up your VIN…" : <>See My Estimate <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={goToOffer}>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="year">Year</label>
                  <select id="year" className="field" value={year} onChange={(e) => { setYear(e.target.value); setTrim(""); }}>
                    <option value="">Select year</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="make">Make</label>
                  <select
                    id="make"
                    className="field"
                    value={make}
                    onChange={(e) => { setMake(e.target.value); setModel(""); setTrim(""); }}
                  >
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
                    onChange={(e) => { setModel(e.target.value); setTrim(""); }}
                  >
                    <option value="">{make ? "Select model" : "Select make first"}</option>
                    {models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="trim">Trim</label>
                  <select
                    id="trim"
                    className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    value={trim}
                    disabled={!model || trimsLoading}
                    onChange={(e) => setTrim(e.target.value)}
                  >
                    <option value="">
                      {!model ? "Select model first" : trimsLoading ? "Loading trims…" : "Not sure"}
                    </option>
                    {[...trims].sort((a, b) => a.item.localeCompare(b.item)).map((t) => (
                      <option key={t.item} value={t.item}>{t.item}</option>
                    ))}
                  </select>
                  {model && !trimsLoading && trims.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted">No exact trim listed? Pick &ldquo;Not sure&rdquo; and we&apos;ll prepare a custom offer.</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="km">Mileage (km)</label>
                  <input id="km" type="number" inputMode="numeric" min={0} className="field" placeholder="e.g. 80000" value={kmv} onChange={(e) => setKmv(e.target.value)} />
                  <p className="mt-1.5 text-xs text-muted">A rough, approximate number is totally fine.</p>
                </div>
              </div>

              {photoBlock}

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                {callLine}
                <button type="submit" disabled={!step1Valid} className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50">
                  See My Estimate <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
            </>
          )}
        </div>
      )}

      {/* -------------------- STEP 1b: confirm decoded VIN -------------------- */}
      {step === 1 && decoded && (
        <ConfirmCard decoded={decoded} onConfirm={confirmDecoded} onReject={rejectDecoded} />
      )}

      {/* -------------------- STEP 2: offer -------------------- */}
      {step === 2 && (
        <div className="mt-8 animate-fade-up">
          {calculating ? (
            <div className="animate-fade-up">
              <div className="mb-6 flex items-center justify-center gap-3 text-navy">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
                <span className="font-semibold">
                  Calculating your estimate…
                </span>
              </div>
              <OfferSkeleton />
            </div>
          ) : !estimate ? null : isUnique ? (
            <UniqueOffer onContinue={advanceToContact} onBack={() => { setEditing(true); setStep(1); }} vehicle={{ year, make, model, trim }} />
          ) : (
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="card p-6 sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {year} {make} {model} {trim}
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold text-navy">
                  Your estimated range
                </h1>
                <div className="mt-5">
                  <OfferGauge low={estimate.low} high={estimate.high} />
                </div>
              </div>

              <div className="flex flex-col">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand">
                  <Check className="h-4 w-4" /> Estimate ready
                </span>
                <div className="mt-3 font-display text-4xl font-extrabold text-brand sm:text-5xl">
                  <CountUp value={estimate.low} format={cad} /> –{" "}
                  <CountUp value={estimate.high} format={cad} />
                </div>
                {estimate.source === "market" && estimate.comps ? (
                  <p className="mt-2 text-xs font-medium text-muted">
                    Based on {estimate.comps.toLocaleString()} recent Canadian listings.
                  </p>
                ) : null}
                <p className="mt-3 text-muted">
                  This is an <span className="font-semibold text-navy">estimated range</span> for
                  your {year} {make} {model} with {fmtKm(Number(kmv))}. Want your firm
                  offer? We can call, text, or email you after confirming a few details.
                </p>
                <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  No obligation. This range is free — a real buyer confirms your firm offer with you.
                </p>

                <button onClick={advanceToContact} className="btn-primary mt-6 text-lg">
                  Get My Firm Offer <ArrowRight className="h-5 w-5" />
                </button>
                <a
                  href={telHref}
                  onClick={() => track("phone_click", { location: "offer_step2" })}
                  className="btn mt-3 border-2 border-brand bg-white py-3.5 text-brand hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  <Phone className="h-5 w-5" /> Call Now Instead
                </a>

                <div className="mt-7 rounded-2xl bg-slate-50 p-5">
                  <p className="font-semibold text-navy">What happens next?</p>
                  <ul className="mt-3 space-y-3 text-sm text-muted">
                    <li className="flex gap-3"><Phone className="h-5 w-5 shrink-0 text-brand" /> We call or text you a firm offer (email if you prefer).</li>
                    <li className="flex gap-3"><Calendar className="h-5 w-5 shrink-0 text-brand" /> We book a time &amp; place and inspect the car.</li>
                    <li className="flex gap-3"><Dollar className="h-5 w-5 shrink-0 text-brand" /> Everything checks out — you get paid on the spot.</li>
                  </ul>
                </div>

                <button onClick={() => { setEditing(true); setStep(1); }} className="mt-4 text-sm font-medium text-muted hover:text-brand">
                  ← Edit vehicle details
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------- STEP 3: contact -------------------- */}
      {step === 3 && (
        <div className="mx-auto mt-8 max-w-xl animate-fade-up">
          <div className="card p-6 sm:p-9">
            <div className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white">
                <Send className="h-7 w-7" />
              </span>
              <h1 className="mt-4 font-display text-2xl font-bold text-navy">
                Where should we send your firm offer?
              </h1>
              {estimate && !estimate.unique ? (
                <p className="mt-2 text-muted">
                  Your estimated range is{" "}
                  <span className="font-semibold text-navy">{cad(estimate.low)} – {cad(estimate.high)}</span>.
                  We&apos;ll confirm a firm offer for your {year} {make} {model} after a
                  few quick details.
                </p>
              ) : (
                <p className="mt-2 text-muted">
                  A specialist will put together a custom offer for your{" "}
                  <span className="font-semibold text-navy">{year} {make} {model}</span>.
                </p>
              )}
            </div>

            <div className="mt-6 rounded-xl bg-brand-50 px-4 py-3 text-center text-sm text-navy">
              Your <span className="font-semibold">firm offer comes in writing</span> — the
              price we agree on is what you&apos;re paid, with no surprise deductions at your door.
            </div>

            <form onSubmit={submitLead} className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="name">First name</label>
                <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoComplete="given-name" autoFocus />
              </div>

              <div>
                <span className="label">How should we reach you?</span>
                <div className="grid grid-cols-3 gap-2">
                  {(["call", "text", "email"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setContactMethod(m)}
                      aria-pressed={contactMethod === m}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition ${
                        contactMethod === m
                          ? "border-brand bg-brand text-white"
                          : "border-slate-200 bg-white text-navy hover:border-brand"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {contactMethod === "email" ? (
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
                </div>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor="cphone">
                      Mobile {contactMethod === "text" ? "number (for text)" : "phone"}
                    </label>
                    <input id="cphone" type="tel" inputMode="numeric" maxLength={14} className="field" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(___) ___-____" autoComplete="tel" />
                  </div>
                  <div>
                    <label className="label" htmlFor="besttime">Best time to reach you <span className="font-normal text-muted">(optional)</span></label>
                    <select id="besttime" className="field" value={bestTime} onChange={(e) => setBestTime(e.target.value)}>
                      <option>Anytime</option>
                      <option>Morning</option>
                      <option>Afternoon</option>
                      <option>Evening</option>
                    </select>
                  </div>
                </>
              )}

              {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={submitting} className="btn-primary w-full text-lg disabled:opacity-60">
                {submitting ? "Sending…" : "Get My Firm Offer"}
                {!submitting && <ArrowRight className="h-5 w-5" />}
              </button>
              <p className="text-center text-sm text-muted">
                We use your details once — to send your offer. We never sell them.{" "}
                <Link href="/privacy" className="font-medium text-brand hover:underline">
                  See our privacy policy
                </Link>
                .
              </p>
              <a
                href={telHref}
                onClick={() => track("phone_click", { location: "offer_step3" })}
                className="btn w-full border-2 border-brand bg-white py-3.5 text-brand hover:-translate-y-0.5 hover:bg-brand-50"
              >
                <Phone className="h-5 w-5" /> Call Now Instead
              </a>

              <ul className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-muted">
                <li className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> We do <span className="font-semibold text-navy">not</span> sell your information.</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> No obligation — the estimate is free.</li>
                <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> A real person reviews your vehicle.</li>
              </ul>
              {(site.amvicNumber || site.insured) && (
                <p className="text-center text-xs font-medium text-navy">
                  {[site.amvicNumber, site.insured ? "Bonded & insured" : ""].filter(Boolean).join(" · ")}
                </p>
              )}
            </form>
          </div>
          <button onClick={() => setStep(2)} className="mx-auto mt-4 block text-sm font-medium text-muted hover:text-brand">
            ← Back
          </button>
        </div>
      )}

      {/* -------------------- STEP 4: success -------------------- */}
      {step === 4 && (
        <div className="mx-auto mt-10 max-w-xl animate-fade-up text-center">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-50 text-brand">
            <Check className="h-10 w-10" />
          </span>
          <h1 className="mt-6 font-display text-3xl font-extrabold text-navy">
            Thanks{name.trim() ? `, ${name.trim()}` : ""} — we got it!
          </h1>
          <p className="mt-3 text-lg text-muted">
            A real {site.name} buyer will contact you soon by{" "}
            <span className="font-semibold text-navy">{contactMethod}</span> with your firm
            offer for the {year} {make} {model}.
          </p>
          <div className="mt-8 rounded-2xl bg-slate-50 p-6 text-left">
            <p className="font-semibold text-navy">Want it faster? Call or text us now.</p>
            <p className="mt-1 text-sm text-muted">
              Skip the wait — our team can finalize your offer right over the phone.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <PhoneButton variant="primary" location="offer_success" />
              <Link href="/" className="btn-ghost">Back to home</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Your car", "Your estimate", "Your details"];
  return (
    <ol className="mx-auto flex max-w-xl items-center">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = step >= n;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold transition ${
                  active ? "bg-brand text-white" : "bg-slate-200 text-slate-500"
                }`}
              >
                {step > n ? <Check className="h-4 w-4" /> : n}
              </span>
              <span className={`hidden text-sm font-semibold sm:block ${active ? "text-navy" : "text-slate-400"}`}>
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <span className={`mx-3 h-0.5 flex-1 rounded ${step > n ? "bg-brand" : "bg-slate-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
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
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand">
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
        <button onClick={onReject} className="btn border-2 border-slate-200 bg-white text-navy hover:border-brand">
          No, enter details manually
        </button>
      </div>
    </div>
  );
}

function UniqueOffer({
  vehicle,
  onContinue,
  onBack,
}: {
  vehicle: { year: string; make: string; model: string; trim: string };
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl shadow-card">
      <div className="bg-gradient-to-r from-brand to-brand-600 px-6 py-8 text-center text-white">
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">
          We&apos;ll put together a <span className="text-accent">custom offer</span>
        </h1>
        <p className="mt-2 text-white/90">
          There aren&apos;t enough recent Canadian listings for your {vehicle.year}{" "}
          {vehicle.make} {vehicle.model}
          {vehicle.trim ? ` ${vehicle.trim}` : ""} to price it instantly. Rather than
          guess, one of our buyers will work out a custom offer for you — just leave your
          details and we&apos;ll reach out shortly.
        </p>
      </div>
      <div className="bg-white p-6 text-center sm:p-8">
        <p className="text-muted">
          No guesswork — a real person reviews your vehicle. Still fast, free, and with no
          obligation.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={onContinue} className="btn-primary">
            Continue <ArrowRight className="h-4 w-4" />
          </button>
          <PhoneButton variant="ghost" location="unique_offer" />
        </div>
        <button onClick={onBack} className="mt-4 text-sm font-medium text-muted hover:text-brand">
          ← Edit vehicle details
        </button>
      </div>
    </div>
  );
}
