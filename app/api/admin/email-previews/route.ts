import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { renderAllEmailPreviews } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authed. Renders every customer-facing email template against the sample-lead
// fixture (lib/email.ts renderAllEmailPreviews) so the admin "Emails" tab can
// show what each one looks like. Pure render — nothing is sent, nothing is
// read from the store, no PII beyond the fixture leaves this endpoint.
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ previews: renderAllEmailPreviews() });
}
