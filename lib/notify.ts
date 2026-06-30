import "server-only";
import type { Lead, Referral } from "./types";

/**
 * Owner alert on every new lead, via a Telegram bot.
 *
 * Gated like GA / MarketCheck: a silent no-op until BOTH env vars are set, so
 * it's safe to ship before the bot exists (and stays quiet during local dev /
 * the smoke test, where they're blank). `notifyNewLead` never throws — the lead
 * is already saved by the time it runs, and an alert failure must never break it.
 *
 * If the lead has car photos, they're sent as a Telegram **photo album (gallery)**
 * with the lead details as the caption; otherwise a plain text message. If the
 * album send fails (e.g. a photo is too large), it falls back to the text alert
 * so the details always get through.
 *
 * IMPORTANT: the caller must `await` this. Amplify runs the route as a Lambda
 * that freezes the instant the HTTP response returns, so a fire-and-forget send
 * (text or photos) can be frozen mid-flight and never deliver.
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const api = (method: string) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
const MAX_ALBUM = 10; // Telegram media-group hard limit

// Category emojis built from codepoints so they always survive the build + JSON
// transport intact (a literal emoji added here once arrived as escaped text).
const EMOJI_CHAT = String.fromCodePoint(0x1f4ac); // 💬 speech balloon
const EMOJI_REFERRAL = String.fromCodePoint(0x1f91d); // 🤝 handshake

/** A lead photo's raw bytes (read from the upload in the API route). */
export type NotifyPhoto = { buffer: Buffer; name: string; type: string };

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

/** Human-friendly message body. Telegram auto-links phone numbers + emails. */
function buildText(lead: Lead): string {
  const c = lead.contact;
  const reach = c.contactMethod ?? "call";
  const lines: string[] = ["🚗 New DriveOffer lead", "", c.name];

  if (lead.vehicle) {
    const v = lead.vehicle;
    const km = v.mileageKm ? ` · ${Number(v.mileageKm).toLocaleString("en-CA")} km` : "";
    lines.push(`${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}${km}`);
  }

  if (lead.estimate && !lead.estimate.unique) {
    lines.push(`Est. ${money(lead.estimate.low)}–${money(lead.estimate.high)}`);
  } else if (lead.kind === "vehicle") {
    lines.push("Needs quote");
  }

  lines.push("", `Prefers: ${reach}`);
  if (c.phone) lines.push(`📞 ${c.phone}`);
  if (c.email) lines.push(`✉️ ${c.email}`);
  if (c.bestTime) lines.push(`🕒 Best time: ${c.bestTime}`);
  if (lead.message) lines.push("", `"${lead.message.slice(0, 200)}"`);

  return lines.join("\n");
}

async function sendText(text: string): Promise<void> {
  const r = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`sendMessage ${r.status}`);
}

/** Send the car photos as a gallery, with the lead details as the caption. */
async function sendPhotos(photos: NotifyPhoto[], caption: string): Promise<void> {
  const top = photos.slice(0, MAX_ALBUM);
  const cap =
    photos.length > MAX_ALBUM ? `${caption}\n(+${photos.length - MAX_ALBUM} more photos)` : caption;
  const fd = new FormData();
  fd.append("chat_id", String(CHAT_ID));

  // A media group needs 2-10 items; a lone photo uses sendPhoto.
  if (top.length === 1) {
    fd.append("caption", cap);
    fd.append("photo", new Blob([top[0].buffer], { type: top[0].type || "image/jpeg" }), top[0].name || "photo.jpg");
    const r = await fetch(api("sendPhoto"), { method: "POST", body: fd });
    if (!r.ok) throw new Error(`sendPhoto ${r.status}`);
    return;
  }

  const media = top.map((p, i) => ({
    type: "photo",
    media: `attach://p${i}`,
    ...(i === 0 ? { caption: cap } : {}),
  }));
  fd.append("media", JSON.stringify(media));
  top.forEach((p, i) =>
    fd.append(`p${i}`, new Blob([p.buffer], { type: p.type || "image/jpeg" }), p.name || `p${i}.jpg`),
  );
  const r = await fetch(api("sendMediaGroup"), { method: "POST", body: fd });
  if (!r.ok) throw new Error(`sendMediaGroup ${r.status}`);
}

/** Alert the owner about a new lead (with a photo gallery if any). No-op if unconfigured; never throws. */
export async function notifyNewLead(lead: Lead, photos: NotifyPhoto[] = []): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const text = buildText(lead);
  try {
    if (photos.length > 0) {
      try {
        await sendPhotos(photos, text);
        return;
      } catch (e) {
        // Photos failed (too big, bad format, etc.) — still deliver the text.
        console.error("[notify] photo album failed, sending text only:", e);
      }
    }
    await sendText(text);
  } catch (e) {
    // Log only — the lead is already saved; alerts must never break it.
    console.error("[notify] lead Telegram alert failed:", e);
  }
}

/**
 * Alert the owner about a new visitor chat message. Fires on every visitor
 * message. No-op if the bot isn't configured; never throws (the message is
 * already saved by the time this runs). Caller must `await` it (Lambda freezes
 * on response — see the note at the top of this file).
 */
export async function notifyNewChatMessage(opts: {
  text: string;
  name?: string;
  contact?: string;
  conversationId: string;
}): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const who = opts.name?.trim() ? opts.name.trim() : "Visitor";
  const lines: string[] = [`${EMOJI_CHAT} New chat message`, "", `From: ${who}`];
  if (opts.contact?.trim()) lines.push(`Contact: ${opts.contact.trim()}`);
  lines.push("", `"${opts.text.slice(0, 500)}"`, "", "Reply in Messages: https://www.driveoffer.ca/admin");
  const text = lines.join("\n");
  try {
    await sendText(text);
  } catch (e) {
    console.error("[notify] chat Telegram alert failed:", e);
  }
}

/**
 * Alert the owner about a new referral — shows the referrer's details and the
 * friend they referred. No-op if unconfigured; never throws. Caller must await.
 */
export async function notifyNewReferral(ref: Referral): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const r = ref.referrer;
  const fr = ref.friend;
  const lines: string[] = [`${EMOJI_REFERRAL} New DriveOffer referral`, "", `Referred by: ${r.name}`];
  if (r.phone) lines.push(`Phone: ${r.phone}`);
  if (r.email) lines.push(`Email: ${r.email}`);
  lines.push("", "Their friend:");
  lines.push(`Name: ${fr.name || "(not given)"}`);
  if (fr.phone) lines.push(`Phone: ${fr.phone}`);
  if (fr.email) lines.push(`Email: ${fr.email}`);
  if (ref.message) lines.push("", `"${ref.message.slice(0, 300)}"`);
  try {
    await sendText(lines.join("\n"));
  } catch (e) {
    console.error("[notify] referral Telegram alert failed:", e);
  }
}
