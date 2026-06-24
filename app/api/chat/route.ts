import { NextRequest, NextResponse } from "next/server";
import { addChatMessage, getConversation } from "@/lib/store";
import { notifyNewChatMessage } from "@/lib/notify";

export const runtime = "nodejs";

const MAX_LEN = 2000;

/** Visitor sends a message (creates the conversation on the first one). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").trim().slice(0, MAX_LEN);
    if (!text) {
      return NextResponse.json({ error: "Empty message." }, { status: 400 });
    }
    const conversationId = body.conversationId ? String(body.conversationId).slice(0, 64) : undefined;
    const name = body.name ? String(body.name).trim().slice(0, 80) : undefined;
    const contact = body.contact ? String(body.contact).trim().slice(0, 120) : undefined;
    const conv = await addChatMessage({ conversationId, role: "visitor", text, name, contact });
    if (!conv) {
      return NextResponse.json({ error: "Could not send." }, { status: 500 });
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
  const id = req.nextUrl.searchParams.get("conversationId");
  if (!id) return NextResponse.json({ ok: true, messages: [] });
  const conv = await getConversation(String(id).slice(0, 64));
  return NextResponse.json({ ok: true, conversationId: id, messages: conv?.messages || [] });
}
