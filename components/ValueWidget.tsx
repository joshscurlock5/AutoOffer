"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAKES, YEARS, modelsFor } from "@/lib/vehicles";
import { track } from "@/lib/analytics";
import { ArrowRight, Car, Lock, Check } from "./icons";

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

  const models = make ? modelsFor(make) : [];
  const ready = Boolean(year && make && model && kmv);
  const vinReady = VIN_RE.test(vin.trim().toUpperCase()) && Boolean(kmv);

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
    const q = new URLSearchParams({ year, make, model, trim, km: kmv });
    router.push(`/get-offer?${q.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="card w-full overflow-hidden border border-slate-100 p-7 sm:p-9"
    >
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand">
          <Car className="h-6 w-6" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold text-navy">
          See What Your Car Is Worth
        </h2>
        <p className="mt-2 text-sm text-muted">
          Takes about a minute. See your estimated range, then talk to a real buyer when you&apos;re ready.
        </p>
      </div>

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
            <p className="mt-1.5 text-xs text-muted">On your registration, insurance card, or driver-side door jamb.</p>
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
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="vw-year">Year</label>
            <select id="vw-year" className="field" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="vw-make">Make</label>
            <select
              id="vw-make"
              className="field"
              value={make}
              onChange={(e) => {
                setMake(e.target.value);
                setModel("");
              }}
            >
              <option value="">Make</option>
              {MAKES.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="vw-model">Model</label>
            <select
              id="vw-model"
              className="field disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              value={model}
              disabled={!make}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">{make ? "Model" : "Select make first"}</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="vw-trim">Trim <span className="font-normal text-muted">(optional)</span></label>
            <input
              id="vw-trim"
              className="field"
              placeholder="e.g. SE, Limited"
              value={trim}
              onChange={(e) => setTrim(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
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

      {inputMode === "manual" && (
        <p className="mt-3 text-center text-xs text-muted">
          Don&apos;t see your make? Choose{" "}
          <span className="font-semibold text-navy">&ldquo;Other / Not listed&rdquo;</span> — we still buy it.
        </p>
      )}

      <button type="submit" className="btn-primary mt-4 w-full text-lg">
        Get My Estimate
        <ArrowRight className="h-5 w-5" />
      </button>
      {showError && ((inputMode === "vin" && !vinReady) || (inputMode === "manual" && !ready)) && (
        <p className="mt-2 text-center text-xs font-medium text-red-600">
          {inputMode === "vin"
            ? "Add your 17-character VIN and mileage to see your estimate."
            : "Just add your year, make, model, and mileage to see your estimate."}
        </p>
      )}

      {/* Concrete, verifiable trust — not invented claims. */}
      <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm text-muted">
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-brand" /> Real buyers in Edmonton, AB
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-brand" /> A real person answers — 24/7
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-brand" /> Paid by e-transfer before we take the keys
        </li>
      </ul>

      <p className="mt-4 flex items-center justify-center gap-2 text-center text-sm text-muted">
        <Lock className="h-4 w-4" /> We never sell your information.
      </p>
    </form>
  );
}
