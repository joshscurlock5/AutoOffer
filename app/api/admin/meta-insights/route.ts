import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { queryMetaSnapshots, putMetaSnapshots } from "@/lib/store";
import {
  buildDailySnapshots,
  fetchSnapshotSlice,
  metaInsightsConfigured,
  BREAKDOWNS,
} from "@/lib/metaInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS = new Set(["account", "campaign", "adset", "ad"]);

/** Mountain-Time day (YYYY-MM-DD) for a timestamp. */
function mtDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}
function isDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** GET — read the persisted daily snapshot time-series for one level + breakdown
 * across a date window. Falls back to a single live Meta pull (and warms the
 * store) when nothing is stored yet, so the dashboard has data before the first
 * nightly cron sync. */
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const configured = metaInsightsConfigured();
  const sp = req.nextUrl.searchParams;
  const level = LEVELS.has(sp.get("level") || "") ? (sp.get("level") as string) : "campaign";
  const bdKey = sp.get("breakdown") || "none";
  const bd = BREAKDOWNS.find((b) => b.key === bdKey && b.levels.includes(level as never));
  if (!bd) {
    return NextResponse.json(
      { error: `breakdown "${bdKey}" not available at level "${level}"` },
      { status: 400 },
    );
  }
  const now = Date.now();
  const until = isDate(sp.get("until")) ? (sp.get("until") as string) : mtDate(now);
  const since = isDate(sp.get("since")) ? (sp.get("since") as string) : mtDate(now - 90 * 86_400_000);

  if (!configured) {
    return NextResponse.json({ configured: false, level, breakdown: bdKey, since, until, rows: [], source: "none" });
  }

  let rows = await queryMetaSnapshots(level, bdKey, since, until);
  let source = "store";
  let error: string | undefined;
  if (!rows.length) {
    // Nothing stored for this slice yet — do a one-off live pull and persist it.
    const live = await fetchSnapshotSlice(level as never, bd, since, until, new Date(now).toISOString());
    error = live.error;
    if (live.rows.length) {
      rows = live.rows;
      source = "live";
      void putMetaSnapshots(live.rows); // fire-and-forget warm of the store
    }
  }
  return NextResponse.json({ configured: true, level, breakdown: bdKey, since, until, rows, source, error });
}

/** POST — on-demand full refresh (every level × breakdown) for a window. Backs
 * the dashboard's "Sync from Meta now" button so the owner never waits for the
 * nightly cron. Body: { since?, until? } (defaults to a trailing 30 days). */
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!metaInsightsConfigured()) {
    return NextResponse.json({ configured: false, written: 0 }, { status: 200 });
  }
  const body = await req.json().catch(() => ({}));
  const now = Date.now();
  const until = isDate(body?.until) ? body.until : mtDate(now);
  const since = isDate(body?.since) ? body.since : mtDate(now - 30 * 86_400_000);
  const { rows, errors, slices } = await buildDailySnapshots(since, until, new Date(now).toISOString());
  const { written, dropped } = rows.length ? await putMetaSnapshots(rows) : { written: 0, dropped: 0 };
  return NextResponse.json({ configured: true, since, until, slices, fetched: rows.length, written, dropped, errors });
}
