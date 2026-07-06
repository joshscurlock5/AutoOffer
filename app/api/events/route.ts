import { NextRequest, NextResponse } from "next/server";
import { addEvents, getLeads } from "@/lib/store";
import { allowRequest, clientIpFrom } from "@/lib/rateLimit";
import type { SiteEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  First-party event beacon — server half of lib/events.ts.
//
//  Accepts { sessionId, visitorId?, events: [{n, p, path, at}] } (≤25 per
//  request, the DynamoDB BatchWrite cap), clamps every field, and batch-writes
//  into the AutoOfferEvents table with a ~12-month TTL. visitorId (durable
//  across sessions, unlike sessionId) is stored as `vid` on each row so
//  lib/profiles.ts can stitch a return visit to the same person. A booking_view
//  event carrying a bookingToken is resolved to its leadId server-side, so a
//  booking page opened from an email on a DIFFERENT device still stitches to
//  the right person. The raw token is never persisted — leadId already makes
//  the row joinable, so bookingToken is stripped from the stored params and
//  any /book/<token> path is rewritten to /book/~ before the row is written.
//
//  Always 200s — sendBeacon can't read responses, and analytics failures must
//  never surface. Rate-limited per IP like every public write endpoint.
// ---------------------------------------------------------------------------

const TTL_DAYS = 365;
const MAX_EVENTS = 25;
const MAX_PARAM_KEYS = 15;

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
}

/** Clamp params to a small bag of scalars (strings capped at 200 chars). */
function clampParams(raw: unknown): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string | number | boolean> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_PARAM_KEYS) break;
    const key = k.slice(0, 40);
    if (typeof v === "string") out[key] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
    else continue;
    n += 1;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Clamp a client timestamp to now ± 48h (clock-skew tolerance); else now. */
function clampAt(v: unknown): string {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  const now = Date.now();
  if (Number.isFinite(t) && Math.abs(now - t) <= 48 * 3600_000) return new Date(t).toISOString();
  return new Date(now).toISOString();
}

function rand4(): string {
  return Math.random().toString(36).slice(2, 6);
}

// Bots pass no cookies/consent state and would otherwise burn through the rate
// limit and pollute the events table; empty/known-bot UAs are dropped silently.
const BOT_UA_RE =
  /bot|crawl|spider|slurp|headless|phantomjs|puppeteer|playwright|lighthouse|pingdom|uptime|facebookexternalhit|meta-externalagent|preview|scanner|python-requests|curl|wget/i;

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get("user-agent") || "";
    if (!ua || BOT_UA_RE.test(ua)) {
      return NextResponse.json({ ok: true }); // bot UA — silently drop
    }

    const body = (await req.json().catch(() => null)) as {
      sessionId?: unknown;
      visitorId?: unknown;
      events?: unknown;
    } | null;
    const sessionId = str(body?.sessionId, 60);
    const visitorId = str(body?.visitorId, 64);
    const rawEvents = Array.isArray(body?.events) ? body!.events.slice(0, MAX_EVENTS) : [];
    if (!sessionId || !rawEvents.length) return NextResponse.json({ ok: true });

    // CGNAT means many real Canadian mobile users share one IP, so the per-IP
    // limit is generous; the per-session limit is the tight one, since a session
    // is one visitor. Drop (with a logged reason) when either trips.
    const ip = clientIpFrom(req);
    if (!(await allowRequest(ip, "events", 3000, 3600))) {
      console.warn(`[events] rate-limited ip=${ip}`);
      return NextResponse.json({ ok: true });
    }
    if (!(await allowRequest("s:" + sessionId, "events", 300, 3600))) {
      console.warn(`[events] rate-limited session=${sessionId}`);
      return NextResponse.json({ ok: true });
    }

    // Resolve a booking token (if any event carries one) to its lead — the only
    // per-request lead lookup, and only when the rare booking_view arrives.
    let tokenLeadId: string | undefined;
    const token = rawEvents
      .map((e) => clampParams((e as { p?: unknown })?.p)?.bookingToken)
      .find((t) => typeof t === "string" && t) as string | undefined;
    if (token) {
      try {
        const leads = await getLeads();
        tokenLeadId = leads.find((l) => l.bookingToken === token)?.id;
      } catch {
        /* stitching is best-effort */
      }
    }

    const ttl = Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
    const items: SiteEvent[] = [];
    for (const raw of rawEvents) {
      const e = raw as { n?: unknown; p?: unknown; path?: unknown; at?: unknown };
      const n = str(e.n, 60);
      if (!n || !/^[a-z0-9_:-]+$/i.test(n)) continue;
      const at = clampAt(e.at);
      const p = clampParams(e.p);
      const hadToken = Boolean(p?.bookingToken);
      // The leadId already makes the row joinable to the person — never persist
      // the raw capability token itself, and scrub it from the /book/<token> path.
      if (p && "bookingToken" in p) delete p.bookingToken;
      const path = str(e.path, 200);
      const redactedPath = path?.startsWith("/book/") ? "/book/~" : path;
      items.push({
        sessionId,
        sk: `${at}#${rand4()}`,
        n,
        ...(p && Object.keys(p).length ? { p } : {}),
        ...(redactedPath ? { path: redactedPath } : {}),
        at,
        ...(visitorId ? { vid: visitorId } : {}),
        ...(tokenLeadId && hadToken ? { leadId: tokenLeadId } : {}),
        ttl,
      });
    }
    if (items.length) await addEvents(items);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[events] error:", e);
    return NextResponse.json({ ok: true });
  }
}
