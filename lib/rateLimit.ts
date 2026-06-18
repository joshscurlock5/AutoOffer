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

/** Pull the best client IP from proxy headers (Amplify/CloudFront set XFF). */
export function clientIpFrom(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
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
