import { NextResponse } from "next/server";
import { getActiveVariant } from "@/lib/store";
import { getSmsScenario } from "@/lib/smsMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: the live contact-requirement variant + the SMS opt-in scenario, so the
// get-offer form renders the matching contact fields and (only when "twilio")
// the SMS consent box. No auth — it only reveals which form is currently live,
// and defaults to today's behavior ("choose" / "off") if anything goes wrong.
export async function GET() {
  try {
    const [activeVariant, smsScenario] = await Promise.all([getActiveVariant(), getSmsScenario()]);
    return NextResponse.json({ activeVariant, smsScenario });
  } catch {
    return NextResponse.json({ activeVariant: "choose", smsScenario: "off" });
  }
}
