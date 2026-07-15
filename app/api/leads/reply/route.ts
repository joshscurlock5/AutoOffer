import { NextRequest, NextResponse } from "next/server";
import { getLeadByShortId, atomicLeadEngagement } from "@/lib/store";
import { postLeadTopic } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuse the cron shared secret so no new env var / amplify.yml whitelist entry is
// needed — both webhooks live behind the same owner-controlled trust boundary.
const SECRET = process.env.CRON_SECRET || "";

// ---------------------------------------------------------------------------
//  POST /api/leads/reply
//    { ref, channel?, text?, subject? }
//  Called by the Gmail Apps Script (scripts/gmail-reply-to-telegram.gs) when a
//  customer replies to one of our emails — the "Ref: <short-id>" it parses from
//  the thread is passed here so the reply is recorded on the lead's profile
//  (lastReplyAt / repliesCount / lastInboundChannel). SMS replies are stamped
//  directly by app/api/sms; this covers the email channel.
//  When `text` (the reply body) is included, we ALSO post it into the customer's
//  Replies-group topic and return { topicPosted: true } so the script knows the
//  topic handled it and can skip its own flat alert (no double-notify).
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
  if (!ref) return NextResponse.json({ ok: false, error: "missing ref" }, { status: 400 });

  const { lead } = await getLeadByShortId(ref);
  if (!lead) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  // Atomic write — see lib/store.ts atomicLeadEngagement (concurrent replies /
  // webhook stamps racing on the same lead).
  await atomicLeadEngagement(lead.id, {
    set: {
      lastReplyAt: new Date().toISOString(),
      lastInboundChannel: channel,
      // A reply = actively engaged; pause automated nurture for 7 days so the owner
      // can handle it without the drip firing at them (the cron reads this gate).
      nurturePausedUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    },
    increment: { repliesCount: 1 },
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
