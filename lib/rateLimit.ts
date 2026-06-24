import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./aws";

// ---------------------------------------------------------------------------
//  Per-IP rate limiting for the MarketCheck-spending endpoints.
//  - The client IP is carried through the call stack with AsyncLocalStorage so
//    the deep budget gate (reserveApiCall) can see it without threading params.
//  - Counters live in the existing cache table as atomic conditional writes
//    (fixed hourly + daily windows, DynamoDB TTL auto-expires them).
//  - We count ONLY real API spends (cache hits never reach the gate), so a
//    seller re-submitting the same car after a typo costs nothing and is never
//    counted. Over the limit -> the spend is refused, which degrades gracefully
//    to the "we'll prepare a custom offer" flow.
//  - Fails OPEN: any DynamoDB error allows the call (the monthly budget cap is
//    the hard backstop), so a transient DB issue never blocks a real customer.
// ---------------------------------------------------------------------------

const TABLE = process.env.MARKET_CACHE_TABLE || "AutoOfferMarketCache";
// ~10-12 valuations/hour (a valuation uses ~2 API calls + the odd trim lookup).
const PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR || 20);
const PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY || 60);

const als = new AsyncLocalStorage<{ ip: string }>();

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

/** Loosely validate an IPv4/IPv6 literal (enough to use as a rate-limit key). */
function isValidIp(ip: string): boolean {
  if (!ip) return false;
  if (IPV4_RE.test(ip)) return ip.split(".").every((o) => Number(o) <= 255);
  return ip.includes(":") && /^[0-9a-fA-F:.]+$/.test(ip); // loose IPv6
}

/** RFC1918 / loopback / link-local — internal hops we skip when reading XFF. */
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4) return false;
  return (
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 169 && p[1] === 254)
  );
}

/** CloudFront-Viewer-Address is always "ip:port" (v4 or unbracketed v6) — drop the port. */
function stripCfvaPort(v: string): string {
  const s = v.trim();
  const i = s.lastIndexOf(":");
  return i > 0 && /^\d+$/.test(s.slice(i + 1)) ? s.slice(0, i) : s;
}

/** An XFF entry is normally a bare IP; strip a port only for [v6]:port or v4:port. */
function normalizeXffIp(v: string): string {
  let s = v.trim();
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    return end > 0 ? s.slice(1, end) : s.slice(1);
  }
  if ((s.match(/:/g) || []).length === 1) s = s.split(":")[0];
  return s;
}

/**
 * Best-effort REAL client IP, hardened against X-Forwarded-For spoofing.
 *
 * Behind Amplify/CloudFront the trusted proxy APPENDS the viewer IP to the END
 * of X-Forwarded-For, so the leftmost token is attacker-controlled — taking it
 * let anyone rotate the header to dodge every per-IP limit. Instead we:
 *   1. Prefer `CloudFront-Viewer-Address` (CloudFront overwrites it; unforgeable).
 *   2. Else take the RIGHTMOST *public* IP in X-Forwarded-For (skipping the
 *      private/internal hops CloudFront/Amplify may append after the viewer).
 *   3. Else fall back to x-real-ip.
 * Returns "unknown" only when nothing parses (callers treat that as fail-open).
 * An attacker can ADD header values but can't stop CloudFront appending the real
 * viewer IP, so "unknown" is not attacker-reachable in production.
 */
export function clientIpFrom(req: Request): string {
  const cfva = req.headers.get("cloudfront-viewer-address");
  if (cfva) {
    const ip = stripCfvaPort(cfva);
    if (isValidIp(ip)) return ip;
  }
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => normalizeXffIp(s)).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isValidIp(parts[i]) && !isPrivateIp(parts[i])) return parts[i];
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isValidIp(parts[i])) return parts[i];
    }
  }
  const xr = req.headers.get("x-real-ip")?.trim();
  if (xr && isValidIp(xr)) return xr;
  return "unknown";
}

/** Run `fn` with the client IP attached so reserveApiCall can rate-limit by it. */
export function withClientIp<T>(ip: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ ip: ip || "unknown" }, fn);
}

export function currentIp(): string | null {
  return als.getStore()?.ip ?? null;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Atomically bump a window counter; false ONLY when confirmed over the limit. */
async function bumpWindow(key: string, limit: number, ttl: number): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id: key },
        UpdateExpression: "ADD #c :n SET #t = :ttl",
        ConditionExpression: "attribute_not_exists(#c) OR #c < :limit",
        ExpressionAttributeNames: { "#c": "count", "#t": "ttl" },
        ExpressionAttributeValues: { ":n": 1, ":limit": limit, ":ttl": ttl },
      }),
    );
    return true;
  } catch (e: unknown) {
    if (e && typeof e === "object" && (e as { name?: string }).name === "ConditionalCheckFailedException") {
      return false; // confirmed over the limit
    }
    return true; // any other (transient) error -> fail open; the budget cap backstops us
  }
}

/**
 * Generic per-IP fixed-window limiter for public write endpoints (lead / chat /
 * referral spam). Returns false ONLY when this IP has exceeded `limit` requests
 * in the current `windowSec` window for `bucket`. Fails OPEN on a missing IP
 * (local dev) or any transient DynamoDB error, so a real customer is never
 * blocked by an infra hiccup. Counters auto-expire via DynamoDB TTL.
 */
export async function allowRequest(
  ip: string,
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  if (!ip || ip === "unknown") return true;
  const now = nowSec();
  const key = `rl:${bucket}:${ip}:${Math.floor(now / windowSec)}`;
  return bumpWindow(key, limit, now + windowSec + 60);
}

/**
 * Returns false only when the current IP has exhausted its hourly OR daily
 * MarketCheck-call allowance. No IP context (e.g. local dev) -> not gated.
 */
export async function allowApiSpend(): Promise<boolean> {
  const ip = currentIp();
  if (!ip || ip === "unknown") return true;
  const now = nowSec();
  const hKey = `rl:h:${ip}:${Math.floor(now / 3600)}`;
  const dKey = `rl:d:${ip}:${Math.floor(now / 86400)}`;
  if (!(await bumpWindow(hKey, PER_HOUR, now + 3700))) return false;
  if (!(await bumpWindow(dKey, PER_DAY, now + 87000))) return false;
  return true;
}
