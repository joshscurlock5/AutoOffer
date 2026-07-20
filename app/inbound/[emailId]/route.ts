import { NextRequest, NextResponse } from "next/server";
import { allowRequest, clientIpFrom } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  Inbound-email attachment viewer — the link posted under a customer reply in
//  Telegram ("📎 N attachments — tap to view"). Shows every attachment of one
//  received email as a tappable photo grid (documents as file links).
//
//  No admin login: the email id (UUIDv4, unguessable) IS the capability — same
//  pattern as the /book/<token> self-booking page — so it opens instantly from
//  a phone. Every view asks Resend for FRESH signed download URLs, so the page
//  keeps working long after the 1-hour URL expiry; images load straight from
//  Resend's CDN (no bytes proxied through us — this page can never time out
//  the way inline photo relays did).
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>
body{margin:0;background:#0f172a;color:#e2e8f0;font:16px/1.5 system-ui,-apple-system,sans-serif;padding:20px}
h1{font-size:18px;margin:0 0 4px}
p.sub{color:#94a3b8;font-size:14px;margin:0 0 16px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
a.card{display:block;background:#1e293b;border-radius:12px;overflow:hidden;text-decoration:none;color:#e2e8f0}
.card img{width:100%;height:260px;object-fit:cover;display:block;background:#0b1220}
.card .cap{padding:8px 12px;font-size:13px;color:#94a3b8;word-break:break-all}
.file{padding:16px 12px;font-size:15px}
p.note{color:#64748b;font-size:12px;margin-top:16px}
</style></head><body>${body}</body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

interface Attachment {
  filename?: string;
  content_type?: string;
  download_url?: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = await params;
  if (!UUID_RE.test(emailId) || !RESEND_API_KEY) {
    return page("Not found", "<h1>Not found</h1><p class=\"sub\">This link isn't valid.</p>", 404);
  }
  const ip = clientIpFrom(req);
  if (!(await allowRequest(ip, "inbound-gallery", 120, 3600))) {
    return page("Slow down", "<h1>Too many requests</h1><p class=\"sub\">Try again in a bit.</p>", 429);
  }

  // Fresh signed URLs on every view + the email's subject/sender for the header.
  let attachments: Attachment[] = [];
  let subject = "";
  let from = "";
  try {
    const [listR, mailR] = await Promise.all([
      fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      }),
      fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      }),
    ]);
    if (listR.ok) {
      const j = (await listR.json().catch(() => ({}))) as { data?: Attachment[] };
      attachments = Array.isArray(j?.data) ? j.data : [];
    }
    if (mailR.ok) {
      const m = (await mailR.json().catch(() => ({}))) as { subject?: string; from?: string | string[] };
      subject = typeof m?.subject === "string" ? m.subject : "";
      from = Array.isArray(m?.from) ? m.from[0] || "" : m?.from || "";
    }
  } catch {
    /* fall through to the empty state */
  }

  if (!attachments.length) {
    return page(
      "Attachments",
      "<h1>No attachments here anymore</h1><p class=\"sub\">They may have expired from the email service — check the original email in Resend.</p>",
      404,
    );
  }

  const cards = attachments
    .map((a) => {
      const name = esc((a.filename || "attachment").slice(0, 120));
      const url = esc(a.download_url || "#");
      if ((a.content_type || "").startsWith("image/")) {
        return `<a class="card" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${name}" loading="lazy"><div class="cap">${name}</div></a>`;
      }
      return `<a class="card" href="${url}" target="_blank" rel="noopener"><div class="file">📄 ${name}</div></a>`;
    })
    .join("");

  const n = attachments.length;
  return page(
    `${n} attachment${n === 1 ? "" : "s"} — DriveOffer`,
    `<h1>📎 ${n} attachment${n === 1 ? "" : "s"}</h1>` +
      `<p class="sub">${esc(from || "Customer")}${subject ? ` — ${esc(subject)}` : ""}</p>` +
      `<div class="grid">${cards}</div>` +
      `<p class="note">Tap a photo to open it full size. Links refresh every time you open this page.</p>`,
  );
}
