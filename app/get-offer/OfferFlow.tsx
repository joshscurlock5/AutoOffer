"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MAKES, YEARS, modelsFor } from "@/lib/vehicles";
import { estimateOffer } from "@/lib/offer";
import type { OfferEstimate } from "@/lib/types";
import { cad, km as fmtKm } from "@/lib/format";
import { site, telHref } from "@/lib/site-config";
import OfferGauge from "@/components/OfferGauge";
import PhoneButton from "@/components/PhoneButton";
import { OfferSkeleton } from "@/components/Skeleton";
import CountUp from "@/components/CountUp";
import {
  ArrowRight, Phone, Check, Camera, Trash, Calendar, Dollar,
  Sparkles, Shield,
} from "@/components/icons";

type Step = 1 | 2 | 3 | 4;
const MAX_PHOTOS = 12;

export default function OfferFlow() {
  const sp = useSearchParams();
  const [step, setStep] = useState<Step>(1);

  // vehicle
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [kmv, setKmv] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  // contact
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [contactMethod, setContactMethod] = useState<"call" | "text" | "email">("call");
  const [bestTime, setBestTime] = useState("Anytime");

  const [estimate, setEstimate] = useState<OfferEstimate | null>(null);
  const [calculating, setCalculating] = useState(false);
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Prefill from query string (from the homepage widget).
  useEffect(() => {
    setYear(sp.get("year") || "");
    setMake(sp.get("make") || "");
    setModel(sp.get("model") || "");
    setTrim(sp.get("trim") || "");
    setKmv(sp.get("km") || "");
    setReferralCode(sp.get("ref") || "");
  }, [sp]);

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

  function goToOffer(e: React.FormEvent) {
    e.preventDefault();
    if (!step1Valid) return;
    const est = estimateOffer({ year, make, model, mileageKm: Number(kmv) });
    setEstimate(est);
    setStep(2);
    // Brief "calculating" skeleton so the offer reveal feels like a real lookup.
    setCalculating(true);
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(() => setCalculating(false), 1300);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name || !phone) {
      setError("Please add your name and a phone number (or just call us).");
      return;
    }
    if (contactMethod === "email" && !email) {
      setError("You chose email — please add your email address.");
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
      fd.append("referralCode", referralCode);
      photos.forEach((f) => fd.append("photos", f));

      const res = await fetch("/api/leads", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Request failed");
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError(
        "Something went wrong submitting your request. Please try again or call us.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isUnique = estimate?.unique;

  return (
    <div className="container-x max-w-4xl py-10 sm:py-14">
      {step < 4 && <Stepper step={step} />}

      {/* -------------------- STEP 1: vehicle details -------------------- */}
      {step === 1 && (
        <form onSubmit={goToOffer} className="card mt-8 animate-fade-up p-6 sm:p-9">
          <h1 className="font-display text-2xl font-bold text-navy sm:text-3xl">
            Tell us about your vehicle
          </h1>
          <p className="mt-2 text-muted">
            A few quick details and photos help us give you the most accurate estimate.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="year">Year</label>
              <select id="year" className="field" value={year} onChange={(e) => setYear(e.target.value)}>
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
                onChange={(e) => { setMake(e.target.value); setModel(""); }}
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
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="">{make ? "Select model" : "Select make first"}</option>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="trim">Trim <span className="font-normal text-muted">(optional)</span></label>
              <input id="trim" className="field" placeholder="e.g. SE, Limited, Sport" value={trim} onChange={(e) => setTrim(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="km">Mileage (km)</label>
              <input id="km" type="number" inputMode="numeric" min={0} className="field" placeholder="e.g. 80000" value={kmv} onChange={(e) => setKmv(e.target.value)} />
            </div>
          </div>

          {/* Photo upload */}
          <div className="mt-6">
            <label className="label">
              Photos <span className="font-normal text-muted">(optional, but speeds up your firm offer)</span>
            </label>
            <label
              htmlFor="photos"
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center transition hover:border-brand hover:bg-brand-50"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-white">
                <Camera className="h-6 w-6" />
              </span>
              <span className="mt-3 font-semibold text-navy">Add photos of your car</span>
              <span className="mt-1 text-sm text-muted">
                Front, back, sides, interior & odometer work best. Up to {MAX_PHOTOS} photos.
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

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted">
              Prefer to talk? Call{" "}
              <a href={telHref} className="font-bold text-brand hover:underline">{site.phoneDisplay}</a>
            </p>
            <button type="submit" disabled={!step1Valid} className="btn-primary w-full sm:w-auto disabled:cursor-not-allowed disabled:opacity-50">
              See My Estimate <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {/* -------------------- STEP 2: offer -------------------- */}
      {step === 2 && estimate && (
        <div className="mt-8 animate-fade-up">
          {calculating ? (
            <div className="animate-fade-up">
              <div className="mb-6 flex items-center justify-center gap-3 text-navy">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
                <span className="font-semibold">
                  Pricing your {year} {make} {model} against recent sales…
                </span>
              </div>
              <OfferSkeleton />
            </div>
          ) : isUnique ? (
            <UniqueOffer onContinue={() => setStep(3)} onBack={() => setStep(1)} vehicle={{ year, make, model, trim }} />
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
                <p className="mt-3 text-muted">
                  This is an <span className="font-semibold text-navy">estimated range</span> for
                  your {year} {make} {model} with {fmtKm(Number(kmv))}. Want your firm
                  offer? We can call, text, or email you after confirming a few details.
                </p>

                <button onClick={() => setStep(3)} className="btn-primary mt-6 text-lg">
                  Get My Firm Offer <ArrowRight className="h-5 w-5" />
                </button>
                <a
                  href={telHref}
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

                <button onClick={() => setStep(1)} className="mt-4 text-sm font-medium text-muted hover:text-brand">
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
                <Sparkles className="h-7 w-7" />
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
              We can <span className="font-semibold">call or text</span> you with your firm
              offer. Prefer email? No problem.
            </div>

            <form onSubmit={submitLead} className="mt-5 space-y-4">
              <div>
                <label className="label" htmlFor="name">Full name</label>
                <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
              </div>
              <div>
                <label className="label" htmlFor="cphone">Mobile phone or text</label>
                <input id="cphone" type="tel" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(___) ___-____" autoComplete="tel" />
                <p className="mt-1.5 text-xs text-muted">
                  We&apos;ll only use this to discuss your vehicle and give you a real offer. No spam.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="email">Email <span className="font-normal text-muted">(optional)</span></label>
                <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
              </div>
              <div>
                <span className="label">Preferred contact method</span>
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
              <div>
                <label className="label" htmlFor="besttime">Best time to reach you</label>
                <select id="besttime" className="field" value={bestTime} onChange={(e) => setBestTime(e.target.value)}>
                  <option>Anytime</option>
                  <option>Morning</option>
                  <option>Afternoon</option>
                  <option>Evening</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ref">Referral code <span className="font-normal text-muted">(optional)</span></label>
                <input id="ref" className="field" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="Were you referred by a friend?" />
              </div>

              {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={submitting} className="btn-primary w-full text-lg disabled:opacity-60">
                {submitting ? "Submitting…" : "Get My Firm Offer"}
                {!submitting && <ArrowRight className="h-5 w-5" />}
              </button>
              <a
                href={telHref}
                className="btn w-full border-2 border-brand bg-white py-3.5 text-brand hover:-translate-y-0.5 hover:bg-brand-50"
              >
                <Phone className="h-5 w-5" /> Call Now Instead
              </a>

              <div className="space-y-1.5 pt-1 text-center text-xs text-muted">
                <p className="flex items-center justify-center gap-2">
                  <Shield className="h-4 w-4" /> No spam, no obligation — one quick conversation with a real person.
                </p>
                {(site.amvicNumber || site.insured) && (
                  <p className="font-medium text-navy">
                    {[site.amvicNumber, site.insured ? "Bonded & insured" : ""].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
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
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-green-100 text-green-600">
            <Check className="h-10 w-10" />
          </span>
          <h1 className="mt-6 font-display text-3xl font-extrabold text-navy">
            You&apos;re all set, {name.split(" ")[0] || "thanks"}!
          </h1>
          <p className="mt-3 text-lg text-muted">
            We&apos;ve received your {year} {make} {model}. A specialist will reach out
            by <span className="font-semibold text-navy">{contactMethod}</span>
            {bestTime !== "Anytime" ? ` (${bestTime.toLowerCase()})` : ""} at{" "}
            <span className="font-semibold text-navy">{phone}</span> with your firm offer.
          </p>
          <div className="mt-8 rounded-2xl bg-slate-50 p-6 text-left">
            <p className="font-semibold text-navy">In a hurry? Call us now.</p>
            <p className="mt-1 text-sm text-muted">
              Skip the wait — our team is ready to finalize your offer over the phone.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <PhoneButton variant="primary" />
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
          This one&apos;s worth a <span className="text-accent">human look</span>
        </h1>
        <p className="mt-2 text-white/90">
          Our quick estimate works best on common models. For your {vehicle.year}{" "}
          {vehicle.make} {vehicle.model}
          {vehicle.trim ? ` ${vehicle.trim}` : ""}, a specialist will put together a
          custom offer — leave your details and we&apos;ll be in touch shortly.
        </p>
      </div>
      <div className="bg-white p-6 text-center sm:p-8">
        <p className="text-muted">
          Some vehicles are best priced by a real person. Don&apos;t worry — it&apos;s
          still fast, free and with no obligation.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={onContinue} className="btn-primary">
            Continue <ArrowRight className="h-4 w-4" />
          </button>
          <PhoneButton variant="ghost" />
        </div>
        <button onClick={onBack} className="mt-4 text-sm font-medium text-muted hover:text-brand">
          ← Edit vehicle details
        </button>
      </div>
    </div>
  );
}
