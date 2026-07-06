"use client";

import { useRef, useState } from "react";
import { Check, ArrowRight, Shield } from "./icons";
import TurnstileBox, { turnstileEnabled } from "./TurnstileBox";
import { trackMeta, newEventId } from "@/lib/metaPixel";
import { track } from "@/lib/analytics";
import { getAttribution, getBehavior, getTouches } from "@/lib/attribution";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [tsToken, setTsToken] = useState("");
  const [errMsg, setErrMsg] = useState("Please add your name, email and phone (or just call us).");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  // Synchronous in-flight lock — prevents a double-click / double-submit from
  // firing a second request (and a second, non-deduped Lead) before React
  // commits the disabled state.
  const sendingRef = useRef(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sendingRef.current) return;
    if (!name || !email || !phone) {
      setErrMsg("Please add your name, email and phone (or just call us).");
      setState("error");
      track("contact_form_error", { reason: "missing_fields" });
      return;
    }
    if (turnstileEnabled && !tsToken) {
      setErrMsg("Please complete the verification below, then send.");
      setState("error");
      track("contact_form_error", { reason: "missing_turnstile" });
      return;
    }
    sendingRef.current = true;
    setState("sending");
    const metaEventId = newEventId();
    try {
      const fd = new FormData();
      fd.append("kind", "inquiry");
      fd.append("name", name);
      fd.append("email", email);
      fd.append("phone", phone);
      fd.append("message", message);
      fd.append("metaEventId", metaEventId);
      // Same profile enrichment the offer flow sends (attribution/journey/behavior).
      fd.append("attribution", JSON.stringify(getAttribution()));
      fd.append("touches", JSON.stringify(getTouches()));
      fd.append("behavior", JSON.stringify(getBehavior()));
      if (tsToken) fd.append("turnstileToken", tsToken);
      const res = await fetch("/api/leads", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      setState("done");
      track("contact_form_submitted", {});
      trackMeta("Contact", {}, metaEventId);
    } catch {
      setState("error");
      track("contact_form_error", { reason: "network" });
    } finally {
      sendingRef.current = false;
    }
  }

  if (state === "done") {
    return (
      <div className="card p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand">
          <Check className="h-8 w-8" />
        </span>
        <h3 className="mt-5 font-display text-2xl font-bold text-navy">Message sent!</h3>
        <p className="mt-2 text-muted">
          Thanks {name.split(" ")[0]} — we&apos;ll be in touch very soon. In a hurry?
          Give us a call and we&apos;ll help right away.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-6 sm:p-8">
      <h3 className="font-display text-2xl font-bold text-navy">Send us a message</h3>
      <p className="mt-1 text-muted">We&apos;ll get back to you as soon as we can.</p>
      <div className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="c-name">Name</label>
          <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-email">Email</label>
            <input id="c-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
          </div>
          <div>
            <label className="label" htmlFor="c-phone">Phone</label>
            <input id="c-phone" type="tel" className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(___) ___-____" autoComplete="tel" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-msg">How can we help? <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="c-msg" rows={4} className="field resize-none" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your vehicle or your question…" />
        </div>

        <TurnstileBox onToken={setTsToken} />

        {state === "error" && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {errMsg}
          </p>
        )}

        <button type="submit" disabled={state === "sending"} className="btn-primary w-full text-lg disabled:opacity-60">
          {state === "sending" ? "Sending…" : "Send Message"}
          {state !== "sending" && <ArrowRight className="h-5 w-5" />}
        </button>
        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted">
          <Shield className="h-4 w-4" /> Your information is private and never sold.
        </p>
      </div>
    </form>
  );
}
