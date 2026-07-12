import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { addLead, getLeads } from "@/lib/store";
import { notifyNewLead } from "@/lib/notify";
import type { Attribution, Lead, VehicleInfo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  Meta Lead Ads webhook — brings Facebook / Instagram Instant-Form leads into
//  the SAME pipeline as website leads (addLead → DynamoDB + Customer-360 read-time
//  stitch, and notifyNewLead → the Telegram alert), instead of sitting unseen in
//  Meta's Leads Center.
//
//  Flow (per Meta's Lead Ads webhook contract):
//   GET  — one-time verification handshake (echo hub.challenge when the verify
//          token matches META_LEADADS_VERIFY_TOKEN).
//   POST — signed change notifications. Meta only sends the leadgen_id; we verify
//          the X-Hub-Signature-256 HMAC against META_APP_SECRET, then call the
//          Graph API with META_PAGE_ACCESS_TOKEN to pull the actual answers
//          (field_data), map them to a Lead, dedupe on leadgen_id, and persist.
//
//  Fail-closed on signature (401, never process unsigned). After a VALID
//  signature we ALWAYS return 200 — even if the Graph fetch or lead build throws
//  — because Meta retries non-200 responses aggressively (which would re-alert /
//  duplicate). Dormant until the three env vars are set.
// ---------------------------------------------------------------------------

const GRAPH_VERSION = "v21.0";

// ---- GET: Meta webhook verification handshake -----------------------------
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge") || "";
  const expected = process.env.META_LEADADS_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    // Echo the challenge back verbatim as plain text so Meta marks the callback verified.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Verify Meta's `X-Hub-Signature-256` header: it is `sha256=` + the hex HMAC-SHA256
 * of the RAW request body keyed with the app secret. Timing-safe. Returns false
 * (fail-closed) when the secret is unset or the header is missing/malformed, so an
 * unsigned request is NEVER processed.
 */
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- Graph API lead detail -------------------------------------------------
interface FieldDatum {
  name?: string;
  values?: unknown[];
}
interface LeadDetail {
  field_data?: FieldDatum[];
  created_time?: string;
  ad_id?: string;
  form_id?: string;
}

/** Pull the submitted answers for a leadgen_id from the Graph API. Returns null
 * (and logs) on any failure — the caller still returns 200 so Meta stops retrying. */
async function fetchLeadDetail(leadgenId: string): Promise<LeadDetail | null> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    console.error("[meta-leads] META_PAGE_ACCESS_TOKEN unset — cannot fetch lead detail");
    return null;
  }
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(leadgenId)}` +
    `?fields=field_data,created_time,ad_id,form_id&access_token=${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`[meta-leads] Graph fetch ${r.status} for leadgen ${leadgenId}: ${(await r.text()).slice(0, 300)}`);
      return null;
    }
    return (await r.json()) as LeadDetail;
  } catch (e) {
    console.error(`[meta-leads] Graph fetch threw for leadgen ${leadgenId}:`, e);
    return null;
  }
}

// ---- field_data normalizer -------------------------------------------------

/** Slugify a Meta question name/label the same way Meta does its custom
 * questions (lowercase, non-alphanumerics → underscore). */
function slug(name: unknown): string {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Collapse field_data into a { slug: value } map (first value wins per key). */
function toFieldMap(fieldData: FieldDatum[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of fieldData || []) {
    const key = slug(f?.name);
    const val = (Array.isArray(f?.values) ? f.values : [])
      .filter((v) => v != null)
      .map((v) => String(v).trim())
      .filter(Boolean)
      .join(", ");
    if (key && val && !map[key]) map[key] = val;
  }
  return map;
}

/** First value whose slugified key matches the regex (undefined if none). */
function pick(map: Record<string, string>, re: RegExp): string | undefined {
  for (const [k, v] of Object.entries(map)) if (re.test(k)) return v;
  return undefined;
}

/** Parse a single free-text "2018 Honda Civic EX" style answer into parts. */
function parseVehicleString(s: string): { year?: string; make?: string; model?: string; trim?: string } {
  const tokens = s.trim().split(/\s+/).filter(Boolean);
  let year: string | undefined;
  const yi = tokens.findIndex((t) => /^(19|20)\d{2}$/.test(t));
  if (yi >= 0) {
    year = tokens[yi];
    tokens.splice(yi, 1);
  }
  const [make, model, ...rest] = tokens;
  return { year, make, model, trim: rest.length ? rest.join(" ") : undefined };
}

/** Extract a numeric odometer reading from a messy answer ("150,000 km" → 150000). */
function parseMileage(s?: string): number {
  if (!s) return 0;
  const n = Number(s.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

interface MappedLead {
  name: string;
  email: string;
  phone: string;
  message?: string;
  vehicle?: VehicleInfo;
}

/**
 * Defensive normalizer: map a Meta Instant-Form's field_data → the fields a
 * DriveOffer Lead needs. Meta lowercases/underscores custom question labels, so
 * everything is matched against the slugified key. Handles standard fields
 * (full_name / email / phone_number), split first/last name, separate
 * make/model/trim/year columns OR one combined "vehicle" free-text answer,
 * mileage/odometer, a VIN, and a condition/damage note.
 */
function mapFieldData(map: Record<string, string>): MappedLead {
  // --- contact ---
  const first = map["first_name"] || pick(map, /first.?name/);
  const last = map["last_name"] || pick(map, /last.?name/);
  const name = (
    map["full_name"] ||
    map["name"] ||
    pick(map, /full.?name/) ||
    [first, last].filter(Boolean).join(" ") ||
    pick(map, /(^|_)name($|_)/) ||
    ""
  )
    .trim()
    .slice(0, 120);
  const email = (map["email"] || pick(map, /e.?mail/) || "").trim().slice(0, 200);
  const phone = (map["phone_number"] || map["phone"] || pick(map, /phone|mobile|cell|(^|_)tel($|_)/) || "")
    .trim()
    .slice(0, 40);

  // --- vehicle: prefer distinct columns; fall back to a combined free-text field ---
  const makeKey = Object.keys(map).find((k) => /(^|_)(make|brand|manufacturer)($|_)/.test(k) && !k.includes("model"));
  const modelKey = Object.keys(map).find((k) => /(^|_)model($|_)/.test(k) && !k.includes("make"));
  let make = makeKey ? map[makeKey] : undefined;
  let model = modelKey ? map[modelKey] : undefined;
  let year = pick(map, /(^|_)year($|_)/);
  let trim = pick(map, /(^|_)trim($|_)/);

  const combined = pick(map, /(^|_)(vehicle|car|make_model|year_make)($|_)/) || pick(map, /make.?model/);
  if (combined && (!make || !model)) {
    const parsed = parseVehicleString(combined);
    year = year || parsed.year;
    make = make || parsed.make;
    model = model || parsed.model;
    trim = trim || parsed.trim;
  }

  const mileageKm = parseMileage(pick(map, /mileage|odometer|kilomet|(^|_)kms?($|_)/));
  const vinRaw = (pick(map, /(^|_)vin($|_)/) || "").toUpperCase();
  const vin = /^[A-HJ-NPR-Z0-9]{17}$/.test(vinRaw) ? vinRaw : undefined;
  const conditionNote = pick(map, /condition|damage|wrong|accident|(^|_)issues?($|_)|dents?/);
  const message = pick(map, /message|comment|(^|_)notes?($|_)|details?|tell_us|anything|question/);

  const hasVehicle = Boolean(make || model || year || mileageKm || vin || combined);
  const vehicle: VehicleInfo | undefined = hasVehicle
    ? {
        year: year || "",
        make: make || "",
        model: model || "",
        ...(trim ? { trim: trim.slice(0, 80) } : {}),
        mileageKm,
        ...(vin ? { vin } : {}),
        ...(conditionNote ? { condition: { tags: [], note: conditionNote.slice(0, 500) } } : {}),
      }
    : undefined;

  return { name, email, phone, ...(message ? { message: message.slice(0, 1000) } : {}), vehicle };
}

// ---- POST: signed leadgen notifications ------------------------------------

interface LeadgenValue {
  leadgen_id?: string;
  form_id?: string;
  page_id?: string;
  ad_id?: string;
  created_time?: number;
}

/** Fetch, map, and persist ONE leadgen event. Idempotent via `seen` (the set of
 * metaLeadgenIds already stored) — a Meta redelivery is skipped. Throws are the
 * caller's to swallow. */
async function processLeadgen(v: LeadgenValue, seen: Set<string>): Promise<void> {
  const leadgenId = String(v.leadgen_id || "").trim();
  if (!leadgenId || seen.has(leadgenId)) return;

  const detail = await fetchLeadDetail(leadgenId);
  if (!detail) return; // failure already logged; return 200 so Meta stops retrying

  const mapped = mapFieldData(toFieldMap(detail.field_data));
  const adId = detail.ad_id || v.ad_id;

  const attribution: Attribution = {
    utmSource: "facebook",
    utmMedium: "paid_social",
    ...(adId ? { utmContent: String(adId).slice(0, 200) } : {}),
  };

  const lead: Lead = {
    id: crypto.randomUUID(),
    kind: mapped.vehicle ? "vehicle" : "inquiry",
    createdAt: new Date().toISOString(),
    status: "new",
    contact: {
      name: mapped.name,
      email: mapped.email,
      phone: mapped.phone,
      // Instant-form leads are phone-first; fall back to email when no number.
      contactMethod: mapped.phone ? "call" : mapped.email ? "email" : "call",
    },
    ...(mapped.vehicle ? { vehicle: mapped.vehicle } : {}),
    photos: [],
    ...(mapped.message ? { message: mapped.message } : {}),
    attribution,
    metaLeadgenId: leadgenId,
    source: "meta_lead_ad",
  };

  await addLead(lead);
  seen.add(leadgenId);
  // Same Telegram alert as a website lead (no-op until the bot is configured).
  await notifyNewLead(lead);
}

export async function POST(req: NextRequest) {
  // 1. Read the RAW body FIRST — signature is computed over these exact bytes.
  const raw = await req.text();

  // 2. Verify the signature. Fail-closed: no valid signature ⇒ 401, never processed.
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 3. From here on ALWAYS return 200 (Meta retries non-200 aggressively). All
  //    Graph/lead work is wrapped so a throw can never turn into a retry storm.
  try {
    const body = JSON.parse(raw) as { entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: LeadgenValue }> }> };

    const events: LeadgenValue[] = [];
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.field === "leadgen" && change?.value?.leadgen_id) {
          events.push({ page_id: entry.id, ...change.value });
        }
      }
    }

    if (events.length) {
      // One scan builds the dedupe set for the whole payload (matches how the
      // Resend / SMS webhooks scan getLeads to find their lead).
      let existing: Lead[] = [];
      try {
        existing = await getLeads();
      } catch (e) {
        console.error("[meta-leads] getLeads failed (dedupe degraded)", e);
      }
      const seen = new Set(
        existing.map((l) => l.metaLeadgenId).filter((x): x is string => Boolean(x)),
      );
      for (const v of events) {
        try {
          await processLeadgen(v, seen);
        } catch (e) {
          console.error(`[meta-leads] failed to process leadgen ${v.leadgen_id}:`, e);
        }
      }
    }
  } catch (e) {
    console.error("[meta-leads] webhook processing error:", e);
  }

  return NextResponse.json({ received: true });
}
