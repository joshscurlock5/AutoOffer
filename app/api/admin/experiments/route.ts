import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getLeads, getAllEvents, getActiveVariant, setActiveVariant } from "@/lib/store";
import { getSmsScenario, setSmsScenario } from "@/lib/smsMode";
import { computeExperiments, computeSmsScenarios } from "@/lib/experiments";
import { EXPERIMENT_VARIANTS, type ExperimentVariant } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
//  A/B experiment analytics for the admin "A/B tests" tab.
//  GET  → per-variant funnel + lead outcomes, windowed by ?since/?until (leads
//         cohorted by createdAt, events by their timestamp), plus the currently
//         active variant so the selector reflects reality.
//  POST → { variant } sets the live variant (drives the form + stamps new data).
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const since = DATE_RE.test(sp.get("since") || "") ? (sp.get("since") as string) : "";
  const until = DATE_RE.test(sp.get("until") || "") ? (sp.get("until") as string) : "";
  const inWindow = (iso: string): boolean => {
    const d = (iso || "").slice(0, 10);
    if (!d) return false;
    if (since && d < since) return false;
    if (until && d > until) return false;
    return true;
  };

  try {
    const [allLeads, allEvents, activeVariant, smsScenario] = await Promise.all([
      getLeads(),
      getAllEvents(),
      getActiveVariant(),
      getSmsScenario(),
    ]);
    const leads = allLeads.filter((l) => !l.archived && inWindow(l.createdAt));
    const events = allEvents.filter((e) => inWindow(e.at));
    const data = computeExperiments(leads, events, activeVariant);
    const sms = computeSmsScenarios(leads, events, smsScenario);
    return NextResponse.json({ since, until, smsScenario, smsScenarios: sms.scenarios, ...data });
  } catch (e) {
    console.error("[experiments] failed:", e);
    // Soft-fail 200 like the other admin analytics routes — the tab shows an empty state.
    return NextResponse.json({ since, until, activeVariant: "choose", smsScenario: "off", variants: [], smsScenarios: [], error: "Failed to load" });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { variant?: string; smsScenario?: string } | null;

  // SMS opt-in scenario toggle — a separate A/B from the contact-requirement
  // variant (off = no texting box / twilio = box shown).
  if (body?.smsScenario !== undefined) {
    const s = body.smsScenario;
    if (s !== "off" && s !== "twilio") {
      return NextResponse.json({ error: "Invalid smsScenario" }, { status: 400 });
    }
    try {
      await setSmsScenario(s);
      return NextResponse.json({ ok: true, smsScenario: s });
    } catch (e) {
      console.error("[experiments] set sms failed:", e);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
  }

  const variant = body?.variant;
  if (!variant || !EXPERIMENT_VARIANTS.some((v) => v.key === variant)) {
    return NextResponse.json({ error: "Invalid variant" }, { status: 400 });
  }
  try {
    await setActiveVariant(variant as ExperimentVariant);
    return NextResponse.json({ ok: true, activeVariant: variant });
  } catch (e) {
    console.error("[experiments] set failed:", e);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
