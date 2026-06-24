import { NextRequest, NextResponse } from "next/server";
import { getBudgetStatus } from "@/lib/marketCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  Inbound Telegram webhook — the ONLY place the bot receives messages.
//  Telegram POSTs every update here once the webhook is registered (run
//  scripts/set-telegram-webhook.mjs). We only act on the `/usage` command,
//  only from the authorized chat, and only when the secret header matches.
//  Everything else returns 200 and is ignored, so Telegram never retries.
// ---------------------------------------------------------------------------

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const EMOJI_USAGE = String.fromCodePoint(0x1f4ca); // 📊 bar chart

async function reply(chatId: number | string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch {
    /* best-effort */
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Telegram's secret header (set during setWebhook). If we have a
    //    secret configured and it doesn't match, silently ignore.
    if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
      return NextResponse.json({ ok: true });
    }

    const update = await req.json().catch(() => ({}));
    const msg = update?.message ?? update?.channel_post;
    const text: string = String(msg?.text || "").trim();
    const fromChat = msg?.chat?.id;

    // 2) Only respond to the authorized chat.
    if (!msg || (CHAT_ID && String(fromChat) !== String(CHAT_ID))) {
      return NextResponse.json({ ok: true });
    }

    // 3) /usage (also matches "/usage@YourBot")
    if (/^\/usage(@\w+)?\b/i.test(text)) {
      const s = await getBudgetStatus();
      const body = s.ok
        ? [
            `${EMOJI_USAGE} MarketCheck API usage`,
            "",
            `Used: ${s.used} / ${s.cap}`,
            `Left: ${s.remaining}`,
            `Resets: ${s.resetLabel} (UTC)`,
          ].join("\n")
        : "Couldn't read the usage counter right now - try again shortly.";
      await reply(fromChat, body);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[telegram webhook] error:", e);
    // Always 200 so Telegram doesn't back off / retry storm.
    return NextResponse.json({ ok: true });
  }
}
