import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addLead, savePhotos } from "@/lib/store";
import { getEstimate } from "@/lib/valuation";
import { notifyNewLead } from "@/lib/notify";
import type { Lead, UploadedPhoto, VehicleInfo, OfferEstimate } from "@/lib/types";

export const runtime = "nodejs";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Defensively parse the estimate the client was shown (used only as a fallback). */
function parseShownEstimate(raw: string): OfferEstimate | undefined {
  if (!raw) return undefined;
  try {
    const o = JSON.parse(raw);
    if (!o || o.unique) return undefined;
    const low = Number(o.low);
    const high = Number(o.high);
    const mid = Number(o.mid);
    if (![low, high, mid].every((n) => Number.isFinite(n) && n >= 0)) return undefined;
    if (high < low) return undefined;
    return {
      low,
      high,
      mid,
      currency: "CAD",
      source: o.source === "market" ? "market" : "estimate",
      ...(Number.isFinite(Number(o.comps)) ? { comps: Number(o.comps) } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const kind = str(form.get("kind")) === "inquiry" ? "inquiry" : "vehicle";
    const name = str(form.get("name"));
    const email = str(form.get("email"));
    const phone = str(form.get("phone"));
    const cmRaw = str(form.get("contactMethod"));
    const contactMethod = (["call", "text", "email"].includes(cmRaw) ? cmRaw : "call") as
      | "call"
      | "text"
      | "email";
    const bestTime = str(form.get("bestTime")) || undefined;

    // Require a name plus the contact channel that matches the chosen method.
    // (Email-preference leads have no phone — they were silently rejected before.)
    const missingChannel = contactMethod === "email" ? !email : !phone;
    if (!name || missingChannel) {
      return NextResponse.json(
        {
          error:
            contactMethod === "email"
              ? "Name and email are required."
              : "Name and phone are required.",
        },
        { status: 400 },
      );
    }
    if (contactMethod === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const id = crypto.randomUUID();
    let vehicle: VehicleInfo | undefined;
    let estimate: OfferEstimate | undefined;
    let photos: UploadedPhoto[] = [];

    if (kind === "vehicle") {
      const year = str(form.get("year"));
      const make = str(form.get("make"));
      const model = str(form.get("model"));
      const trim = str(form.get("trim"));
      const mileageKm = Number(str(form.get("mileageKm"))) || 0;

      vehicle = { year, make, model, trim: trim || undefined, mileageKm };
      // Re-derive the estimate server-side. Normally a warm-cache hit (the user
      // just viewed it), so usually no extra MarketCheck call; on a cold/expired
      // cache it may spend one budget-gated call (and fails closed to "unique").
      estimate = await getEstimate({ year, make, model, mileageKm, trim: trim || undefined });
      // If we couldn't re-price it but the customer was already shown a concrete
      // range, store what they actually saw so the lead matches the screen.
      if (estimate.unique) {
        const shown = parseShownEstimate(str(form.get("estimateJson")));
        if (shown) estimate = shown;
      }

      const files = form
        .getAll("photos")
        .filter((f): f is File => f instanceof File && f.size > 0);
      photos = await savePhotos(id, files);
    }

    const lead: Lead = {
      id,
      kind,
      createdAt: new Date().toISOString(),
      status: "new",
      contact: { name, email, phone, contactMethod, bestTime },
      vehicle,
      estimate,
      photos,
      message: str(form.get("message")) || undefined,
      referralCode: str(form.get("referralCode")) || undefined,
      source: "web",
    };

    await addLead(lead);
    // Best-effort owner SMS alert (Twilio). Awaited so Amplify's Lambda doesn't
    // freeze the send; never throws, so the saved lead is unaffected.
    await notifyNewLead(lead);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("POST /api/leads failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
