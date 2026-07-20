import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientIpFrom } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  Single-attachment image proxy for the /inbound/[emailId] gallery. Resend's
//  signed download URLs only work from SERVERS (their CDN refuses browser
//  requests), so the gallery's <img> tags point here and we stream the bytes
//  through. One file per request keeps each invocation seconds-long — the
//  all-six-in-one-request shape is what used to 504 the webhook.
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Attachment {
  filename?: string;
  content_type?: string;
  download_url?: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ emailId: string; idx: string }> }) {
  const { emailId, idx } = await params;
  const i = Number(idx);
  if (!UUID_RE.test(emailId) || !RESEND_API_KEY || !Number.isInteger(i) || i < 0 || i > 19) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ip = clientIpFrom(req);
  if (!(await allowRequest(ip, "inbound-img", 600, 3600))) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  try {
    // Fresh signed URL for THIS file (they expire hourly).
    const listR = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!listR.ok) return new NextResponse("Gone", { status: 404 });
    const j = (await listR.json().catch(() => ({}))) as { data?: Attachment[] };
    const a = (Array.isArray(j?.data) ? j.data : [])[i];
    if (!a?.download_url) return new NextResponse("Not found", { status: 404 });

    const file = await fetch(a.download_url, { signal: AbortSignal.timeout(15000) });
    if (!file.ok || !file.body) return new NextResponse("Gone", { status: 404 });

    const name = (a.filename || "attachment").replace(/[^\w.\- ]/g, "_").slice(0, 100);
    return new NextResponse(file.body, {
      headers: {
        "Content-Type": a.content_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${name}"`,
        // Same bytes for the life of the email — let the browser keep them.
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("[inbound-img] proxy failed:", e);
    return new NextResponse("Error", { status: 502 });
  }
}
