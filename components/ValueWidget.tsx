"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAKES, YEARS, modelsFor } from "@/lib/vehicles";
import { site, telHref } from "@/lib/site-config";
import { ArrowRight, Phone } from "./icons";

export default function ValueWidget() {
  const router = useRouter();
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [kmv, setKmv] = useState("");

  const models = make ? modelsFor(make) : [];
  const ready = Boolean(year && make && model && kmv);
  const missing = !year ? "year" : !make ? "make" : !model ? "model" : "mileage";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const q = new URLSearchParams({ year, make, model, trim, km: kmv });
    router.push(`/get-offer?${q.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="card w-full overflow-hidden border border-slate-100 p-6 sm:p-7"
    >
      <div className="text-center">
        <h2 className="font-display text-2xl font-bold text-navy">
          See What Your Car Is Worth
        </h2>
        <div className="mx-auto mt-2 h-1 w-14 rounded-full bg-brand" />
        <p className="mt-3 text-sm text-muted">
          Free estimate first. No obligation. Talk to a real buyer when you&apos;re ready.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="vw-year">Year</label>
          <select
            id="vw-year"
            className="field"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
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

      <button
        type="submit"
        disabled={!ready}
        className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        Get My Instant Estimate
        <ArrowRight className="h-4 w-4" />
      </button>
      {!ready && (
        <p className="mt-2 text-center text-xs text-muted">
          Add your <span className="font-semibold text-navy">{missing}</span> to see your estimate
        </p>
      )}

      <p className="mt-4 text-center text-sm text-muted">
        Prefer to talk?{" "}
        <a href={telHref} className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
          <Phone className="h-4 w-4" /> Call or text {site.phoneDisplay}
        </a>
      </p>
    </form>
  );
}
