import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getLeads, addLead, updateLead } from "@/lib/store";
import { clientIpFrom, allowRequest } from "@/lib/rateLimit";
import type { Lead, VehicleInfo } from "@/lib/types";
import { parseAttribution, parseBehavior, parseTouches } from "@/lib/attribution";
import { clientIdFromGaCookie } from "@/lib/ga4Mp";

export const runtime = "nodejs";

// ===========================================================================
//  Abandoned-cart capture. The contact step's fields fire navigator.sendBeacon()
//  here the moment a valid phone/email is typed — BEFORE the customer submits —
//  so a high-intent abandoner is reachable. We persist a status:"partial" lead;
//  the scheduled cron sends ONE recovery touch later (email if present, else an
//  owner "call this abandoner" alert), and only if they never fully converted.
//
//  This endpoint only stores data the user already typed — it never messages the
//  customer itself. Deduped against real leads (never resurrects a converted one)
//  and against an existing partial (refreshes rather than duplicates).
// ===========================================================================

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (s: string) => s.replace(/\D/g, "");

// This route has no Turnstile (it fires on every field blur, pre-submit), so
// form-filling bots/crawlers would otherwise become "Abandoned" partial leads
// that get real recovery emails and enter the Meta audience CSVs. A missing or
// obviously-automated UA is rejected before anything is read/written.
const BOT_UA_RE =
  /bot|crawl|spider|slurp|headless|phantomjs|puppeteer|playwright|lighthouse|pingdom|uptime|facebookexternalhit|meta-externalagent|preview|scanner|python-requests|curl|wget/i;

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFrom(req);
    if (!(await allowRequest(ip, "partial", 20, 3600))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const userAgent = req.headers.get("user-agent") || "";
    if (!userAgent || BOT_UA_RE.test(userAgent)) {
      return NextResponse.json({ ok: true, skipped: "bot" });
    }

    // Server-side mirror of the banner's opt-out (lib/consent.ts) — a denial
    // skips the Meta ad-match key stamp (mirrors app/api/leads/route.ts).
    const consentDenied = req.cookies.get("ao_consent")?.value === "denied";

    const body = await req.json().catch(() => ({}));
    const email = str(body.email);
    const phone = str(body.phone);
    const validEmail = EMAIL_RE.test(email);
    const validPhone = digits(phone).length >= 10;
    // Nothing reachable typed yet — ignore (this fires on every field blur).
    if (!validEmail && !validPhone) {
      return NextResponse.json({ ok: true, skipped: "no contact" });
    }

    const name = str(body.name);
    const year = str(body.year);
    const make = str(body.make);
    const model = str(body.model);
    const trim = str(body.trim);
    const mileageKm = Number(str(body.mileageKm)) || 0;
    const cmRaw = str(body.contactMethod);
    const contactMethod = (["call", "text", "email"].includes(cmRaw) ? cmRaw : "call") as
      | "call"
      | "text"
      | "email";
    const vehicle: VehicleInfo | undefined =
      year || make || model ? { year, make, model, trim: trim || undefined, mileageKm } : undefined;

    // Per-person profile enrichment (mirrors the full lead route).
    const attribution = parseAttribution(body.attribution);
    const touchHistory = parseTouches(body.touches);
    const behavior = parseBehavior(body.behavior);
    const gaClientId = clientIdFromGaCookie(req.cookies.get("_ga")?.value);

    // Meta ad-match keys (mirrors app/api/leads/route.ts) so a recovered partial's
    // offline Purchase can still be attributed back to the originating ad click.
    // Skipped on a stored consent denial.
    const fbp = req.cookies.get("_fbp")?.value;
    const fbc = req.cookies.get("_fbc")?.value;
    const meta = { ...(fbc ? { fbc } : {}), ...(fbp ? { fbp } : {}), clientIp: ip, userAgent };

    // Dedupe against existing leads by email/phone (volume is small; a scan is cheap).
    const leads = await getLeads();
    const eKey = validEmail ? email.toLowerCase() : "";
    const pKey = validPhone ? digits(phone) : "";
    const match = leads.find((l) => {
      const le = (l.contact.email || "").toLowerCase();
      const lp = digits(l.contact.phone || "");
      return (eKey && le === eKey) || (pKey && lp === pKey);
    });

    // A real (submitted) lead already exists — they converted or are in-flight. Do nothing.
    if (match && match.status !== "partial") {
      return NextResponse.json({ ok: true, deduped: true });
    }
    // An earlier partial exists — refresh it instead of creating a duplicate.
    if (match && match.status === "partial") {
      await updateLead(match.id, {
        contact: { name, email, phone, contactMethod },
        vehicle,
        ...(behavior ? { behavior } : {}),
        // Preserve first-touch attribution / gaClientId — only fill if not already set.
        ...(attribution && !match.attribution
          ? { attribution, landingPath: attribution.landingPath, referrerUrl: attribution.referrer }
          : {}),
        // The journey GROWS over time (client array is append-only), so newer wins.
        ...(touchHistory ? { touchHistory } : {}),
        ...(gaClientId && !match.gaClientId ? { gaClientId } : {}),
        ...(!match.meta && !consentDenied ? { meta } : {}),
      });
      return NextResponse.json({ ok: true, updated: true });
    }

    const lead: Lead = {
      id: crypto.randomUUID(),
      kind: "vehicle",
      createdAt: new Date().toISOString(),
      status: "partial",
      contact: { name, email, phone, contactMethod },
      vehicle,
      photos: [],
      ...(consentDenied ? { consentDenied: true } : { meta }),
      ...(attribution
        ? { attribution, landingPath: attribution.landingPath, referrerUrl: attribution.referrer }
        : {}),
      ...(touchHistory ? { touchHistory } : {}),
      ...(behavior ? { behavior } : {}),
      ...(gaClientId ? { gaClientId } : {}),
      source: "web-partial",
    };
    await addLead(lead);
    return NextResponse.json({ ok: true, created: true });
  } catch (e) {
    console.error("POST /api/leads/partial failed", e);
    // Never surface an error to the beacon caller.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
