import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addLead, savePhotos, markLookupConverted } from "@/lib/store";
import { getEstimate } from "@/lib/valuation";
import { notifyNewLead, type NotifyPhoto } from "@/lib/notify";
import type { Lead, UploadedPhoto, VehicleInfo, OfferEstimate } from "@/lib/types";
import { clientIpFrom, allowRequest } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

// Hard caps on uploaded photos — bound S3 cost / server memory against abuse.
const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_PHOTOS_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB per submission
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

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
    // Rate limit by IP BEFORE parsing the (potentially large) multipart body.
    const ip = clientIpFrom(req);
    if (!(await allowRequest(ip, "leads", 6, 3600))) {
      return NextResponse.json({ error: "Too many submissions. Please try again in a bit." }, { status: 429 });
    }
    const form = await req.formData();

    // Bot check (Cloudflare Turnstile). No-op until keys are configured; once set,
    // it rejects missing/forged tokens BEFORE any S3 write or Telegram alert.
    if (!(await verifyTurnstile(str(form.get("turnstileToken")), ip))) {
      return NextResponse.json(
        { error: "Verification failed. Please refresh the page and try again." },
        { status: 403 },
      );
    }

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
    let photoBuffers: NotifyPhoto[] = [];

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
      if (files.length > MAX_PHOTOS) {
        return NextResponse.json({ error: `Please attach at most ${MAX_PHOTOS} photos.` }, { status: 413 });
      }
      let totalBytes = 0;
      for (const f of files) {
        if (!ALLOWED_PHOTO_TYPES.has(f.type)) {
          return NextResponse.json({ error: "Photos must be images (JPG, PNG, WebP, HEIC or GIF)." }, { status: 415 });
        }
        if (f.size > MAX_PHOTO_BYTES) {
          return NextResponse.json({ error: "Each photo must be under 10 MB." }, { status: 413 });
        }
        totalBytes += f.size;
      }
      if (totalBytes > MAX_PHOTOS_TOTAL_BYTES) {
        return NextResponse.json({ error: "Total photo size must be under 50 MB." }, { status: 413 });
      }
      photos = await savePhotos(id, files);
      // Keep the raw bytes in memory to attach to the owner's Telegram alert as
      // a photo gallery (read after savePhotos so it can never disrupt the S3 save).
      photoBuffers = await Promise.all(
        files.map(async (f) => ({
          buffer: Buffer.from(await f.arrayBuffer()),
          name: f.name || "photo.jpg",
          type: f.type || "image/jpeg",
        })),
      );
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
    // Best-effort owner alert (Telegram), with a photo gallery if any. Awaited so
    // Amplify's Lambda doesn't freeze the send; never throws, so the lead is safe.
    await notifyNewLead(lead, photoBuffers);
    // Link this lead back to the price-lookup it came from (admin "API Calls"
    // conversion tracking). Strictly after the lead is saved + alerted, and
    // best-effort (markLookupConverted swallows its own errors), so it can never
    // block or fail a lead.
    const lookupId = str(form.get("lookupId"));
    if (lookupId) await markLookupConverted(lookupId, id);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    console.error("POST /api/leads failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
