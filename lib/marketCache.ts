import "server-only";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "./aws";

// ---------------------------------------------------------------------------
//  DynamoDB-backed cache + monthly call budget for the MarketCheck free tier
//  (500 calls/month). Cache hits cost zero API calls; the budget counter makes
//  sure we never blow past the free quota — once it's near the cap we stop
//  calling and fall back to the local estimate model.
//  Table: AutoOfferMarketCache (key: id) with DynamoDB TTL on the `ttl` field.
// ---------------------------------------------------------------------------

const TABLE = process.env.MARKET_CACHE_TABLE || "AutoOfferMarketCache";
const MONTHLY_BUDGET = Number(process.env.MARKETCHECK_MONTHLY_BUDGET || 480);

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function monthKey(): string {
  const d = new Date();
  return `budget:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id: key } }));
    if (!res.Item) return null;
    if (typeof res.Item.ttl === "number" && res.Item.ttl < nowSec()) return null;
    return (res.Item.value as T) ?? null;
  } catch {
    return null;
  }
}

export async function cachePut(key: string, value: unknown, ttlDays: number): Promise<void> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { id: key, value, ttl: nowSec() + Math.round(ttlDays * 86400) },
      }),
    );
  } catch {
    /* cache writes are best-effort */
  }
}

/**
 * How many MarketCheck calls we've made this month. Returns a very large number
 * on failure so we fail CLOSED (fall back to the local model) rather than risk
 * exceeding the free quota.
 */
export async function getBudgetCount(): Promise<number> {
  try {
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id: monthKey() } }));
    return Number(res.Item?.count ?? 0);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function hasBudget(count: number): boolean {
  return count < MONTHLY_BUDGET;
}

/**
 * Atomically reserve ONE call against this month's budget. Returns true only if
 * we were under budget (the increment + the check happen as a single
 * conditional write, so concurrent requests can't race past the cap). Fails
 * CLOSED (returns false) when over budget or on any DynamoDB error.
 */
export async function reserveApiCall(): Promise<boolean> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id: monthKey() },
        UpdateExpression: "ADD #c :n SET #t = :ttl",
        ConditionExpression: "attribute_not_exists(#c) OR #c < :budget",
        ExpressionAttributeNames: { "#c": "count", "#t": "ttl" },
        ExpressionAttributeValues: { ":n": 1, ":budget": MONTHLY_BUDGET, ":ttl": nowSec() + 45 * 86400 },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Atomically add to this month's call count (e.g. top up a 429 retry's 2nd call). */
export async function recordApiCalls(n: number): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id: monthKey() },
        UpdateExpression: "ADD #c :n SET #t = :ttl",
        ExpressionAttributeNames: { "#c": "count", "#t": "ttl" },
        ExpressionAttributeValues: { ":n": n, ":ttl": nowSec() + 45 * 86400 },
      }),
    );
  } catch {
    /* best-effort */
  }
}
