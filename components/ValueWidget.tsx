"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MAKES, YEARS, modelsFor } from "@/lib/vehicles";
import { track } from "@/lib/analytics";
import { site, telHref } from "@/lib/site-config";
import { ArrowRight, Car, Lock, Phone } from "./icons";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export default function ValueWidget() {
  const router = useRouter();
  const [inputMode, setInputMode] = useState<"manual" | "vin">("manual");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [kmv, setKmv] = useState("");
  const [vin, setVin] = useState("");
  const [showError, setShowError] = useState(false);

  const [trims, setTrims] = useState<{ item: string; count: number }[]>([]);
  const [trimsLoading, setTrimsLoading] = useState(false);

  const models = make ? modelsFor(make) : [];
  const ready = Boolean(year && make && model && kmv);
  const vinReady = VIN_RE.test(vin.trim().toUpperCase()) && Boolean(kmv);

  // Load the real trims for the chosen year/make/model (manual entry only).
  useEffect(() => {
    if (inputMode !== "manual" || !year || !make || !model) {
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
  }, [inputMode, year, make, model]);

  function submit(e: React.FormEvent) {
    e.preventDefault();

    if (inputMode === "vin") {
      if (!vinReady) {
        setShowError(true);
        const el = document.getElementById(!VIN_RE.test(vin.trim().toUpperCase()) ? "vw-vin" : "vw-km");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
        return;
      }
      track("widget_submit", { mode: "vin" });
      const q = new URLSearchParams({ mode: "vin", vin: vin.trim().toUpperCase(), km: kmv });
      router.push(`/get-offer?${q.toString()}`);
      return;
    }

    if (!ready) {
      // Keep the button live: on an incomplete submit, jump to the first gap.
      setShowError(true);
      const firstMissing = !year ? "vw-year" : !make ? "vw-make" : !model ? "vw-model" : "vw-km";
      const el = document.getElementById(firstMissing);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
      return;
    }
    track("widget_submit", { make, model, year: Number(year) });
    const q = new URLSearchParams({ year, make, model, km: kmv });
    if (trim) q.set("trim", trim);
    router.push(`/get-offer?${q.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="card w-full overflow-hidden border border-slate-100 p-6 sm:p-8"
    >
      <div className="text-center">
        <h2 className="font-display text-[28px] font-bold text-navy sm:text-3xl">
          See What Your Car Is Worth
        </h2>
      </div>

      {/* Mode toggle */}
      <div className="mt-5 flex justify-center">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setInputMode("manual")}
            aria-pressed={inputMode === "manual"}
            className={`rounded-lg px-4 py-2 text-base font-semibold transition ${inputMode === "manual" ? "bg-white text-navy shadow-soft" : "text-muted hover:text-navy"}`}
          >
            Enter details
          </button>
          <button
            type="button"
            onClick={() => setInputMode("vin")}
            aria-pressed={inputMode === "vin"}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-base font-semibold transition ${inputMode === "vin" ? "bg-white text-navy shadow-soft" : "text-muted hover:text-navy"}`}
          >
            <Car className="h-4 w-4" /> Enter VIN <span className="text-muted">(faster)</span>
          </button>
        </div>
      </div>

      {inputMode === "vin" ? (
        <div className="mt-6 grid grid-cols-1 gap-3">
          <div>
            <label className="label" htmlFor="vw-vin">VIN <span className="font-normal text-muted">(17 characters)</span></label>
            <input
              id="vw-vin"
              className="field font-mono uppercase tracking-wide"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="e.g. 1HGCM82633A004352"
              maxLength={17}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="mt-1.5 text-sm text-muted">On your registration, insurance card, or driver-side door jamb.</p>
          </div>
          <div>
            <label className="label" htmlFor="vw-km">Mileage (km)</label>
            <input
              id="vw-km"
              type="number"
              inputMode="numeric"
              min={0}
              className="field"
              placeholder="e.g. 80000"
              value={kmv}
              onChange={(e) => setKmv(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3">
          {/* Year — always shown. Each later field reveals once the previous is
              filled, so the visitor only ever sees one new box at a time. Every
              field spans the full form width, stacked one on top of the next. */}
          <div>
            <label className="label" htmlFor="vw-year">Year</label>
            <select id="vw-year" className="field" value={year} onChange={(e) => { setYear(e.target.value); setMake(""); setModel(""); setTrim(""); }}>
              <option value="">Year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {year && (
            <div className="animate-fade-up">
              <label className="label" htmlFor="vw-make">Make</label>
              <select
                id="vw-make"
                className="field"
                value={make}
                onChange={(e) => {
                  setMake(e.target.value);
                  setModel("");
                  setTrim("");
                }}
              >
                <option value="">Make</option>
                {MAKES.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {make && (
            <div className="animate-fade-up">
              <label className="label" htmlFor="vw-model">Model</label>
              <select
                id="vw-model"
                className="field"
                value={model}
                onChange={(e) => { setModel(e.target.value); setTrim(""); }}
              >
                <option value="">Model</option>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {model && (
            <div className="animate-fade-up">
              <label className="label" htmlFor="vw-trim">Trim</label>
              <select
                id="vw-trim"
                className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                value={trim}
                disabled={trimsLoading}
                onChange={(e) => setTrim(e.target.value)}
              >
                <option value="">
                  {trimsLoading ? "Loading trims…" : "Not sure"}
                </option>
                {[...trims].sort((a, b) => a.item.localeCompare(b.item)).map((t) => (
                  <option key={t.item} value={t.item}>{t.item}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="vw-km">Mileage (km)</label>
            <input
              id="vw-km"
              type="number"
              inputMode="numeric"
              min={0}
              className="field"
              placeholder="e.g. 80000"
              value={kmv}
              onChange={(e) => setKmv(e.target.value)}
            />
          </div>
        </div>
      )}

      {inputMode === "manual" && year && (
        <p className="mt-3 text-center text-sm text-muted">
          Don&apos;t see your make? Choose{" "}
          <span className="font-semibold text-navy">&ldquo;Other / Not listed&rdquo;</span> — we still buy it.
        </p>
      )}

      <button type="submit" className="btn-primary mt-4 w-full text-lg">
        Get My Estimate
        <ArrowRight className="h-5 w-5" />
      </button>
      <a
        href={telHref}
        onClick={() => track("phone_click", { location: "form_call" })}
        className="btn-ghost mt-3 w-full text-lg"
      >
        <Phone className="h-5 w-5" /> Call or text {site.phoneDisplay}
      </a>
      {showError && ((inputMode === "vin" && !vinReady) || (inputMode === "manual" && !ready)) && (
        <p role="alert" aria-live="polite" className="mt-2 text-center text-sm font-medium text-red-600">
          {inputMode === "vin"
            ? "Add your 17-character VIN and mileage to see your estimate."
            : "Just add your year, make, model, and mileage to see your estimate."}
        </p>
      )}

      <p className="mt-4 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-center text-base text-navy">
        <Lock className="h-4 w-4" /> We never sell your information.
      </p>
    </form>
  );
}
