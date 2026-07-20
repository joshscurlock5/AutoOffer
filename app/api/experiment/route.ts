import { NextResponse } from "next/server";
import { getActiveVariant } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: the live contact-requirement variant, so the get-offer form renders the
// matching contact fields. No auth — it only reveals which form is currently live
// (and defaults to "choose", i.e. today's behavior, if anything goes wrong).
export async function GET() {
  try {
    return NextResponse.json({ activeVariant: await getActiveVariant() });
  } catch {
    return NextResponse.json({ activeVariant: "choose" });
  }
}
