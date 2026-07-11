import { NextRequest, NextResponse } from "next/server";
import { addChatMessage, getConversation, updateConversation } from "@/lib/store";
import { notifyNewChatMessage } from "@/lib/notify";
import { clientIpFrom, allowRequest } from "@/lib/rateLimit";
import { parseAttribution } from "@/lib/attribution";

export const runtime = "nodejs";

const MAX_LEN = 2000;

/** Visitor sends a message (creates the conversation on the first one). */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFrom(req);
    if (!(await allowRequest(ip, "chat", 40, 3600))) {
      return NextResponse.json({ error: "Too many messages. Please try again in a bit." }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").trim().slice(0, MAX_LEN);
    if (!text) {
      return NextResponse.json({ error: "Empty message." }, { status: 400 });
    }
    const conversationId = body.conversationId ? String(body.conversationId).slice(0, 64) : undefined;
    // Starting a NEW conversation is the real flood vector — cap it much tighter.
    if (!conversationId && !(await allowRequest(ip, "chat-new", 6, 3600))) {
      return NextResponse.json({ error: "Too many new chats. Please try again later." }, { status: 429 });
    }
    const name = body.name ? String(body.name).trim().slice(0, 80) : undefined;
    const contact = body.contact ? String(body.contact).trim().slice(0, 120) : undefined;
    // Context (Batch 8) — stitches the chat to the person's profile. visitorId /
    // sessionId / path / attribution ride from the widget (the same data leads
    // carry); userAgent + clientIp are server-side and consent-gated like leads.
    const consentDenied = req.cookies.get("ao_consent")?.value === "denied";
    const visitorId = body.visitorId ? String(body.visitorId).slice(0, 64) : undefined;
    const sessionId = body.sessionId ? String(body.sessionId).slice(0, 64) : undefined;
    const startedOnPath = body.path ? String(body.path).slice(0, 200) : undefined;
    const attribution = parseAttribution(body.attribution);
    const userAgent = consentDenied ? undefined : (req.headers.get("user-agent") || "").slice(0, 400) || undefined;
    const clientIp = consentDenied ? undefined : ip;
    const conv = await addChatMessage({
      conversationId,
      role: "visitor",
      text,
      name,
      contact,
      visitorId,
      sessionId,
      startedOnPath,
      attribution,
      userAgent,
      clientIp,
    });
    if (!conv) {
      return NextResponse.json({ error: "Could not send." }, { status: 500 });
    }
    // Track the visitor's current page on every message (unlike startedOnPath,
    // which addChatMessage only sets once via if_not_exists). Best-effort — a
    // failure here must never block the chat send.
    if (startedOnPath) {
      try {
        await updateConversation(conv.id, { lastPath: startedOnPath });
      } catch (e) {
        console.error("[chat] lastPath update failed", e);
      }
    }
    // Telegram alert on every visitor message (best-effort; must be awaited so the
    // Lambda doesn't freeze first). Use the conversation's stored contact/name so
    // follow-up messages still carry them.
    await notifyNewChatMessage({
      text,
      name: conv.name ?? undefined,
      contact: conv.contact ?? undefined,
      conversationId: conv.id,
    });
    return NextResponse.json({ ok: true, conversationId: conv.id, messages: conv.messages });
  } catch (err) {
    console.error("POST /api/chat failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}

/** Visitor polls for new messages (admin replies). */
export async function GET(req: NextRequest) {
  // Generous per-IP cap so a tight polling loop can't drive unbounded DynamoDB
  // reads — well above the widget's few-second poll cadence.
  const ip = clientIpFrom(req);
  if (!(await allowRequest(ip, "chat-poll", 600, 3600))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const id = req.nextUrl.searchParams.get("conversationId");
  if (!id) return NextResponse.json({ ok: true, messages: [] });
  const conv = await getConversation(String(id).slice(0, 64));
  return NextResponse.json({ ok: true, conversationId: id, messages: conv?.messages || [] });
}
