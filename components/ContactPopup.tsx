"use client";

import { useEffect, useState } from "react";
import { site, telHref, mailHref } from "@/lib/site-config";
import { track } from "@/lib/analytics";
import { Phone, Mail, X } from "./icons";

export default function ContactPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="mt-12 text-center">
      <h3 className="font-display text-2xl font-bold text-navy">Still have questions?</h3>
      <button type="button" onClick={() => setOpen(true)} className="btn-dark mt-5">
        Contact us
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-navy/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Contact us"
            className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-lift"
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <h4 className="font-display text-lg font-bold text-navy">
                Need help with your offer?
              </h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="icon-btn h-8 w-8 text-muted hover:text-navy"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-navy">Phone</p>
              <p className="text-sm text-muted">Call or text our team — a real person answers, 24/7.</p>
              <a
                href={telHref}
                onClick={() => track("phone_click", { location: "faq_contact" })}
                className="btn-primary mt-4 w-full"
              >
                <Phone className="h-5 w-5" /> {site.phoneDisplay}
              </a>
              <a
                href={mailHref}
                className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-muted hover:text-brand"
              >
                <Mail className="h-4 w-4" /> {site.email}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
