import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getLookups } from "@/lib/store";

export const runtime = "nodejs";

/** Admin-only: the price-lookup log shown in the "API Calls" tab. */
export async function GET() {
  if (!isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lookups = await getLookups();
  return NextResponse.json({ lookups });
}
