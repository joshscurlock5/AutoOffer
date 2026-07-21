import { NextRequest, NextResponse } from "next/server";
import { getLeadByShortId, findLeadByEmail, atomicLeadEngagement, lastSentEmailKind } from "@/lib/store";
import { postLeadTopic } from "@/lib/notify";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuse the cron shared secret so no new env var / amplify.yml whitelist entry is
// needed — both webhooks live behind the same owner-controlled trust boundary.
const SECRET = process.env.CRON_SECRET || "";

/** Pull the bare email out of a "Name <email@x>" (or plain) From header, lowercased. */
function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  const raw = (m ? m[1] : from).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : "";
}

// ---------------------------------------------------------------------------
//  POST /api/leads/reply
//    { ref, from?, channel?, text?, subject? }
//  Called by the Gmail Apps Script (scripts/gmail-reply-to-telegram.gs) when a
//  customer replies to one of our emails. We resolve the CUSTOMER by the sender's
//  email (`from`) first — so ALL mail from that address lands in their one thread —
//  and fall back to the "Ref: <short-id>" tag. The reply is recorded on the lead's
//  profile (lastReplyAt / repliesCount / lastInboundChannel), and when `text` (the
//  reply body) is included we ALSO post it into that customer's Replies-group topic
//  and return { topicPosted: true } so the script skips its flat alert (no dupes).
//  Auth: Authorization: Bearer <CRON_SECRET>. No-op 401 until configured.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  if (!SECRET || (req.headers.get("authorization") || "") !== `Bearer ${SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  const chRaw = typeof body.channel === "string" ? body.channel : "email";
  const channel = (["sms", "email", "chat"].includes(chRaw) ? chRaw : "email") as "sms" | "email" | "chat";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const fromEmail = extractEmail(typeof body.from === "string" ? body.from : "");
  if (!ref && !fromEmail) return NextResponse.json({ ok: false, error: "missing ref/from" }, { status: 400 });

  // Resolve the customer: the sender's email routes ALL their mail to one thread;
  // fall back to the Ref'd lead (e.g. sender differs from the address on file).
  let lead: Lead | null = fromEmail ? await findLeadByEmail(fromEmail) : null;
  if (!lead && ref) lead = (await getLeadByShortId(ref)).lead;
  if (!lead) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // Atomic write — see lib/store.ts atomicLeadEngagement (concurrent replies /
  // webhook stamps racing on the same lead).
  // Only an EMAIL reply becomes an email "replied" receipt (attributed to the email
  // that most likely prompted it) so the Emails tab's per-template response rate is right.
  const rkind = channel === "email" ? lastSentEmailKind(lead) : undefined;
  await atomicLeadEngagement(lead.id, {
    set: {
      lastReplyAt: new Date().toISOString(),
      lastInboundChannel: channel,
      // A reply = actively engaged; pause automated nurture for 7 days so the owner
      // can handle it without the drip firing at them (the cron reads this gate).
      nurturePausedUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    },
    increment: { repliesCount: 1 },
    ...(channel === "email"
      ? { appendCommsEvent: { at: new Date().toISOString(), channel: "email", type: "replied", ...(rkind ? { kind: rkind } : {}) } }
      : {}),
  });

  // Post the reply body into the customer's topic (when we have it). topicPosted
  // tells the caller whether the topic took it, so it can skip its flat alert.
  let topicPosted = false;
  if (text) {
    const inbound = [
      `📩 ${lead.contact.name || "Customer"} (email)`,
      ...(subject ? [`Subject: ${subject}`] : []),
      "",
      `"${text.slice(0, 900)}"`,
    ].join("\n");
    topicPosted = await postLeadTopic(lead, inbound);
  }
  return NextResponse.json({ ok: true, topicPosted });
}
