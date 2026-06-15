"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAKES, YEARS, modelsFor } from "@/lib/vehicles";
import { ArrowRight, Car, Lock } from "./icons";

export default function ValueWidget() {
  const router = useRouter();
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [kmv, setKmv] = useState("");

  const models = make ? modelsFor(make) : [];
  const ready = Boolean(year && make && model && kmv);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
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
        className="btn-primary mt-5 w-full text-lg disabled:cursor-not-allowed disabled:opacity-50"
      >
        Get My Instant Estimate
        <ArrowRight className="h-5 w-5" />
      </button>
      {!ready && (
        <p className="mt-2 text-center text-xs text-muted">
          Add your year, make, model, and mileage to see your estimate.
        </p>
      )}

      <p className="mt-4 flex items-center justify-center gap-2 text-center text-sm text-muted">
        <Lock className="h-4 w-4" /> We never sell your information.
      </p>
    </form>
  );
}
