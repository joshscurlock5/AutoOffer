import "server-only";
import crypto from "crypto";
import type { Ga4Traffic } from "./types";

// ===========================================================================
//  GA4 Data API — READ aggregate traffic (visitors / sessions / sources / geo /
//  device). This is the "everyone who visited" picture the lead-based sections
//  can't see (anonymous traffic). Auth is a service-account JWT signed with
//  Node's crypto (no googleapis dependency): sign → exchange for an access token
//  → batchRunReports. Gated: no-op (null) until GA4_PROPERTY_ID +
//  GA4_SA_CLIENT_EMAIL + GA4_SA_PRIVATE_KEY are set. Never throws. Cached.
// ===========================================================================

const PROPERTY = process.env.GA4_PROPERTY_ID;
const CLIENT_EMAIL = process.env.GA4_SA_CLIENT_EMAIL;
// Amplify stores the key on one line with literal "\n" — restore real newlines.
const PRIVATE_KEY = (process.env.GA4_SA_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const TTL_MS = 10 * 60 * 1000;

export function ga4Configured(): boolean {
  return Boolean(PROPERTY && CLIENT_EMAIL && PRIVATE_KEY);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (!ga4Configured()) return null;
  if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({
        iss: CLIENT_EMAIL,
        scope: "https://www.googleapis.com/auth/analytics.readonly",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
      }),
    );
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    const jwt = `${header}.${claims}.${b64url(signer.sign(PRIVATE_KEY))}`;
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
    });
    if (!r.ok) {
      console.error("[ga4] token", r.status, (await r.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const j = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return j.access_token;
  } catch (e) {
    console.error("[ga4] token error", e);
    return null;
  }
}

interface GaRow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}
interface GaReport {
  rows?: GaRow[];
}

const num = (v?: string): number => Number(v) || 0;
const fmtDate = (d?: string): string =>
  d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d || "";

const dataCache = new Map<string, { at: number; data: Ga4Traffic }>();

export async function getGa4Traffic(days = 30, country?: string): Promise<Ga4Traffic | null> {
  if (!ga4Configured()) return null;
  const key = `${days}|${country || ""}`;
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "today" }];
    // When a country is selected, constrain EVERY report to it so the totals,
    // sources, and device mix reflect just that country's visitors (e.g. US
    // organic). The value matches GA4's own "By country" dimension labels.
    const df = country
      ? { dimensionFilter: { filter: { fieldName: "country", stringFilter: { value: country } } } }
      : {};
    const body = {
      requests: [
        { dateRanges, ...df, metrics: [{ name: "totalUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "engagementRate" }] },
        { dateRanges, ...df, dimensions: [{ name: "date" }], metrics: [{ name: "totalUsers" }], orderBys: [{ dimension: { dimensionName: "date" } }] },
        { dateRanges, ...df, dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "totalUsers" }, { name: "sessions" }], orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }], limit: 12 },
        { dateRanges, ...df, dimensions: [{ name: "country" }], metrics: [{ name: "totalUsers" }], orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }], limit: 12 },
        { dateRanges, ...df, dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "totalUsers" }], orderBys: [{ metric: { metricName: "totalUsers" }, desc: true }] },
      ],
    };
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:batchRunReports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.error("[ga4] report", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return dataCache.get(key)?.data || null;
    }
    const j = (await r.json()) as { reports?: GaReport[] };
    const reports = j.reports || [];
    const t = reports[0]?.rows?.[0]?.metricValues || [];
    const data: Ga4Traffic = {
      totals: {
        users: num(t[0]?.value),
        newUsers: num(t[1]?.value),
        sessions: num(t[2]?.value),
        pageviews: num(t[3]?.value),
        engagementRate: num(t[4]?.value),
      },
      overTime: (reports[1]?.rows || []).map((row) => ({ date: fmtDate(row.dimensionValues?.[0]?.value), users: num(row.metricValues?.[0]?.value) })),
      bySource: (reports[2]?.rows || []).map((row) => ({ label: row.dimensionValues?.[0]?.value || "(unknown)", users: num(row.metricValues?.[0]?.value), sessions: num(row.metricValues?.[1]?.value) })),
      byCountry: (reports[3]?.rows || []).map((row) => ({ label: row.dimensionValues?.[0]?.value || "(unknown)", users: num(row.metricValues?.[0]?.value) })),
      byDevice: (reports[4]?.rows || []).map((row) => ({ label: row.dimensionValues?.[0]?.value || "(unknown)", users: num(row.metricValues?.[0]?.value) })),
    };
    dataCache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.error("[ga4] report error", e);
    return dataCache.get(key)?.data || null;
  }
}
