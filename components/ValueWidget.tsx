"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAKES, YEARS, modelsFor } from "@/lib/vehicles";
import { track, trackFunnel } from "@/lib/analytics";
import { site } from "@/lib/site-config";
import { ArrowRight, Car, GoogleG, Star, Lock } from "./icons";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export default function ValueWidget() {
  const router = useRouter();
  const [inputMode, setInputMode] = useState<"manual" | "vin">("manual");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [vin, setVin] = useState("");
  const [showError, setShowError] = useState(false);

  // Fire each granular funnel event at most once per mount (on first interaction).
  const fired = useRef<Set<string>>(new Set());
  function once(event: string) {
    if (fired.current.has(event)) return;
    fired.current.add(event);
    track(event);
  }

  const models = make ? modelsFor(make) : [];
  const ready = Boolean(year && make && model);
  const vinReady = VIN_RE.test(vin.trim().toUpperCase());

  function submit(e: React.FormEvent) {
    e.preventDefault();

    if (inputMode === "vin") {
      if (!vinReady) {
        setShowError(true);
        document.getElementById("vw-vin")?.focus();
        return;
      }
      trackFunnel("widget_submit", { mode: "vin" }, { search_string: vin.trim().toUpperCase() });
      const q = new URLSearchParams({ mode: "vin", vin: vin.trim().toUpperCase(), source: "widget" });
      router.push(`/get-offer?${q.toString()}`);
      return;
    }

    if (!ready) {
      setShowError(true);
      const firstMissing = !year ? "vw-year" : !make ? "vw-make" : "vw-model";
      document.getElementById(firstMissing)?.focus();
      return;
    }
    trackFunnel("widget_submit", { make, model, year: Number(year) }, { search_string: `${year} ${make} ${model}`.trim() });
    const q = new URLSearchParams({ year, make, model, source: "widget" });
    router.push(`/get-offer?${q.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="card w-full overflow-hidden border border-slate-100 p-6 sm:p-8"
    >
      {/* Mode toggle */}
      <div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setInputMode("manual")}
            aria-pressed={inputMode === "manual"}
            className={`flex-1 rounded-lg px-3 py-2.5 text-base font-semibold transition sm:text-lg ${inputMode === "manual" ? "bg-white text-navy shadow-soft" : "text-muted hover:text-navy"}`}
          >
            Make &amp; Model
          </button>
          <button
            type="button"
            onClick={() => setInputMode("vin")}
            aria-pressed={inputMode === "vin"}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-base font-semibold transition sm:text-lg ${inputMode === "vin" ? "bg-white text-navy shadow-soft" : "text-muted hover:text-navy"}`}
          >
            <Car className="h-4 w-4 sm:h-5 sm:w-5" /> Enter VIN <span className="hidden text-muted sm:inline">(faster)</span>
          </button>
        </div>
      </div>

      {inputMode === "vin" ? (
        <div className="mt-6">
          <label className="label" htmlFor="vw-vin">VIN <span className="font-normal text-muted">(17 characters)</span></label>
          <input
            id="vw-vin"
            className="field font-mono uppercase tracking-wide"
            value={vin}
            onChange={(e) => { once("home_form_start"); setVin(e.target.value.toUpperCase()); }}
            placeholder="e.g. 1HGCM82633A004352"
            maxLength={17}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="mt-1.5 text-sm text-muted">On your registration, insurance card, or driver-side door jamb.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Year, make and model: stacked on phones, side by side in one
              compact row on larger screens. Model unlocks once a make is
              chosen (its options depend on the make). */}
          <div>
            <label className="label" htmlFor="vw-year">Year</label>
            <select id="vw-year" className="field" value={year} onChange={(e) => { once("home_form_start"); if (e.target.value) once("home_year_selected"); setYear(e.target.value); }}>
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
              onChange={(e) => { once("home_form_start"); if (e.target.value) once("home_make_selected"); setMake(e.target.value); setModel(""); }}
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
              onChange={(e) => { once("home_form_start"); if (e.target.value) once("home_model_selected"); setModel(e.target.value); }}
            >
              <option value="">{make ? "Model" : "Select a make first"}</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <button type="submit" className="btn-primary mt-5 w-full py-4 text-lg">
        Get a Free Offer
        <ArrowRight className="h-5 w-5" />
      </button>
      <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted">
        <Lock className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" /> Secure form. Your details are only used to prepare your offer.
      </p>
      {showError && ((inputMode === "vin" && !vinReady) || (inputMode === "manual" && !ready)) && (
        <p role="alert" aria-live="polite" className="mt-2 text-center text-sm font-medium text-red-600">
          {inputMode === "vin"
            ? "Add your 17-character VIN to continue."
            : "Just pick your year, make, and model to continue."}
        </p>
      )}

      {/* Mobile/small only: social proof inside the form (desktop shows it by the tagline). */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-3 border-t border-slate-100 pt-4 wide:hidden">
        <p className="text-sm text-muted">
          <span className="text-2xl font-extrabold text-navy">{site.carsBought.toLocaleString("en-CA")}+</span> cars sold to DriveOffer
        </p>
        {(site.reviewsUrl as string) && (
          <a
            href={site.reviewsUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="See us on Google Reviews"
            className="inline-flex shrink-0 items-center gap-2"
          >
            <GoogleG className="h-5 w-5" />
            <span className="flex text-amber-400" role="img" aria-label="5.0 out of 5 stars">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-4 w-4" />
              ))}
            </span>
            <span className="font-display text-xl font-extrabold text-navy">5.0 <span className="text-sm font-normal text-muted">stars</span></span>
          </a>
        )}
      </div>
    </form>
  );
}
