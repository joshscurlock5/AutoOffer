"use client";

import { useState } from "react";
import { site } from "@/lib/site-config";
import { Check, ArrowRight, Gift } from "./icons";

export default function ReferralForm() {
  const [f, setF] = useState({
    referrerName: "",
    referrerEmail: "",
    referrerPhone: "",
    friendName: "",
    friendPhone: "",
    friendEmail: "",
    message: "",
  });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  function set(k: keyof typeof f) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.referrerName || !f.referrerEmail) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setCode(data.code || "");
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-600">
          <Check className="h-8 w-8" />
        </span>
        <h3 className="mt-5 font-display text-2xl font-bold text-navy">You&apos;re in!</h3>
        <p className="mt-2 text-muted">
          Thanks {f.referrerName.split(" ")[0]}! Share your code with your friend.
          When they sell to {site.name}, we&apos;ll send you ${site.referralReward}.
        </p>
        {code && (
          <div className="mx-auto mt-6 max-w-xs">
            <p className="text-sm font-medium text-muted">Your referral code</p>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-brand bg-brand-50 px-4 py-3">
              <span className="font-mono text-lg font-bold tracking-wider text-brand">{code}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-sm font-semibold text-brand hover:underline"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-navy"><Gift className="h-6 w-6" /></span>
        <h3 className="font-display text-2xl font-bold text-navy">Refer a friend</h3>
      </div>

      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand">Your details</p>
      <div className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="r-name">Your name</label>
            <input id="r-name" className="field" value={f.referrerName} onChange={set("referrerName")} placeholder="Your name" />
          </div>
          <div>
            <label className="label" htmlFor="r-email">Your email</label>
            <input id="r-email" type="email" className="field" value={f.referrerEmail} onChange={set("referrerEmail")} placeholder="you@email.com" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="r-phone">Your phone <span className="font-normal text-muted">(so we can send your $100)</span></label>
          <input id="r-phone" type="tel" className="field" value={f.referrerPhone} onChange={set("referrerPhone")} placeholder="(___) ___-____" />
        </div>
      </div>

      <p className="mt-6 text-sm font-semibold uppercase tracking-wide text-brand">Your friend&apos;s details <span className="font-normal normal-case text-muted">(optional)</span></p>
      <div className="mt-3 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="f-name">Friend&apos;s name</label>
            <input id="f-name" className="field" value={f.friendName} onChange={set("friendName")} placeholder="Their name" />
          </div>
          <div>
            <label className="label" htmlFor="f-phone">Friend&apos;s phone</label>
            <input id="f-phone" type="tel" className="field" value={f.friendPhone} onChange={set("friendPhone")} placeholder="(___) ___-____" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="f-msg">Anything we should know? <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="f-msg" rows={3} className="field resize-none" value={f.message} onChange={set("message")} placeholder="e.g. They have a 2018 Civic they want to sell." />
        </div>
      </div>

      {state === "error" && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          Please enter at least your name and email.
        </p>
      )}

      <button type="submit" disabled={state === "sending"} className="btn-primary mt-6 w-full text-lg disabled:opacity-60">
        {state === "sending" ? "Submitting…" : "Get My Referral Code"}
        {state !== "sending" && <ArrowRight className="h-5 w-5" />}
      </button>
    </form>
  );
}
