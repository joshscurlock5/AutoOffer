"use client";

import { useState } from "react";
import { site } from "@/lib/site-config";
import { track } from "@/lib/analytics";
import { Check, ArrowRight } from "./icons";
import TurnstileBox, { turnstileEnabled } from "./TurnstileBox";

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
  const [tsToken, setTsToken] = useState("");
  const [errMsg, setErrMsg] = useState("Please enter at least your name and email.");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  function set(k: keyof typeof f) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.referrerName || !f.referrerEmail) {
      setErrMsg("Please enter at least your name and email.");
      setState("error");
      return;
    }
    if (turnstileEnabled && !tsToken) {
      setErrMsg("Please complete the verification below, then submit.");
      setState("error");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, turnstileToken: tsToken }),
      });
      if (!res.ok) throw new Error();
      setState("done");
      track("referral_submitted", { hasFriendDetails: !!(f.friendName || f.friendPhone) });
    } catch {
      track("referral_error");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand">
          <Check className="h-8 w-8" />
        </span>
        <h3 className="mt-5 font-display text-2xl font-bold text-navy">Thank you!</h3>
        <p className="mt-2 text-muted">
          Thanks {f.referrerName.split(" ")[0]}! We&apos;ve received your referral. We&apos;ll
          contact you once your friend sells their car to {site.name} and send you $
          {site.referralReward}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/referral-refer.png?v=2" alt="" aria-hidden="true" className="h-11 w-11" />
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

      <div className="mt-5">
        <TurnstileBox onToken={setTsToken} />
      </div>

      {state === "error" && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {errMsg}
        </p>
      )}

      <button type="submit" disabled={state === "sending"} className="btn-primary mt-6 w-full text-lg disabled:opacity-60">
        {state === "sending" ? "Submitting…" : "Submit Referral"}
        {state !== "sending" && <ArrowRight className="h-5 w-5" />}
      </button>
    </form>
  );
}
