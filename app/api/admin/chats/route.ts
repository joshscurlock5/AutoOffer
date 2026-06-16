import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { addChatMessage, getConversation, getConversations } from "@/lib/store";

export const runtime = "nodejs";

const MAX_LEN = 2000;

/** List conversation summaries, or one full conversation via ?conversationId. */
export async function GET(req: NextRequest) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("conversationId");
  if (id) {
    const conversation = await getConversation(id);
    return NextResponse.json({ conversation });
  }
  const all = await getConversations();
  const conversations = all.map((c) => {
    const last = c.messages?.[c.messages.length - 1];
    return {
      id: c.id,
      name: c.name || null,
      updatedAt: c.updatedAt,
      lastSender: c.lastSender,
      count: c.messages?.length || 0,
      preview: last ? last.text.slice(0, 140) : "",
    };
  });
  return NextResponse.json({ conversations });
}

/** Admin replies to a conversation. */
export async function POST(req: NextRequest) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const conversationId = String(body.conversationId || "");
  const text = String(body.text || "").trim().slice(0, MAX_LEN);
  if (!conversationId || !text) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const conversation = await addChatMessage({ conversationId, role: "admin", text });
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, conversation });
}
